#!/usr/bin/env python3
"""swemock sandbox agent: the entrypoint of every sandbox container.

Reads one JSON bundle from stdin, writes the files into /work, runs the user's code, and prints
one JSON result document to stdout. The runner (services/runner) builds the bundle; this script
knows nothing about languages beyond the commands it is given.

Modes
  dsa      compile once, then feed tests one per line to a long-lived driver process. The driver
           answers each test with one JSON line on fd 3, so the user's own stdout stays separate.
  project  run one shell command in /work and parse JUnit XML or JSON test results.

Standard library only; runs on Python >= 3.11 (every sandbox image ships a python3).
"""

import ctypes
import glob
import json
import math
import os
import resource
import selectors
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

WORK = "/work"
OUTPUT_CAP = 64 * 1024
PREVIEW_CAP = 4 * 1024
FULL_OUTPUT_CAP = 8 * 1024 * 1024
COLLECT_CAP = 16 * 1024 * 1024
TOTAL_OUTPUT_CAP = 1024 * 1024  # user stdout+stderr reported across all tests of one run
COMPILE_OUTPUT_CAP = 16 * 1024
STACK_BYTES = 256 * 1024 * 1024
MEMORY_ERROR_MARKERS = ("MemoryError", "std::bad_alloc")


# ---------------------------------------------------------------------------
# Process helpers


def child_setup():
    """Runs in each child between fork and exec."""
    resource.setrlimit(resource.RLIMIT_STACK, (STACK_BYTES, STACK_BYTES))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
    try:
        # Make the user's process the OOM killer's first choice, never the agent.
        with open("/proc/self/oom_score_adj", "w") as f:
            f.write("1000")
    except OSError:
        pass


def make_undumpable():
    """Hide the agent's /proc entries (fds, memory) from user code running as the same uid."""
    try:
        ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 4
    except Exception:
        pass


def oom_kills():
    try:
        with open("/sys/fs/cgroup/memory.events") as f:
            for line in f:
                key, _, value = line.partition(" ")
                if key == "oom_kill":
                    return int(value)
    except OSError:
        pass
    return None


def peak_rss_kb(pid):
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmHWM:"):
                    return int(line.split()[1])
    except OSError:
        pass
    return None


def current_rss_kb(pid):
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1])
    except OSError:
        pass
    return None


def kill_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


class CappedBuffer:
    def __init__(self, cap=OUTPUT_CAP):
        self.cap = cap
        self.data = bytearray()
        self.truncated = False

    def add(self, chunk):
        room = self.cap - len(self.data)
        if room > 0:
            self.data += chunk[:room]
        if len(chunk) > max(room, 0):
            self.truncated = True

    def take(self):
        text = self.data.decode("utf-8", "replace")
        if self.truncated:
            text += "\n…[output truncated at 64KB]"
        self.data = bytearray()
        self.truncated = False
        return text


def run_simple(argv, timeout_s, cwd=WORK, stdin_data=b"", shell=False):
    """Run a command to completion with captured, capped output. Used for compile and project runs."""
    oom_before = oom_kills()
    start = time.monotonic()
    proc = subprocess.Popen(
        argv,
        cwd=cwd,
        shell=shell,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        preexec_fn=child_setup,
    )
    out, err = CappedBuffer(), CappedBuffer()
    sel = selectors.DefaultSelector()
    sel.register(proc.stdout, selectors.EVENT_READ, out)
    sel.register(proc.stderr, selectors.EVENT_READ, err)
    try:
        if stdin_data:
            proc.stdin.write(stdin_data)
        proc.stdin.close()
    except BrokenPipeError:
        pass
    deadline = start + timeout_s
    timed_out = False
    while sel.get_map():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            timed_out = True
            break
        for key, _ in sel.select(timeout=min(remaining, 0.25)):
            chunk = os.read(key.fd, 65536)
            if chunk:
                key.data.add(chunk)
            else:
                sel.unregister(key.fileobj)
    if timed_out:
        kill_group(proc)
    else:
        try:
            proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            timed_out = True
        kill_group(proc)  # reap stragglers in the process group
    sel.close()
    oom_after = oom_kills()
    return {
        "exitCode": None if timed_out else proc.returncode,
        "timedOut": timed_out,
        "oomKilled": oom_before is not None and oom_after is not None and oom_after > oom_before,
        "durationMs": round((time.monotonic() - start) * 1000, 1),
        "stdoutTruncated": out.truncated,
        "stderrTruncated": err.truncated,
        "stdout": out.take(),
        "stderr": err.take(),
    }


# ---------------------------------------------------------------------------
# Checkers


def kind(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "list"
    if isinstance(v, dict):
        return "object"
    return "other"


def exact_equal(a, b):
    ka, kb = kind(a), kind(b)
    if ka != kb:
        return False
    if ka == "list":
        return len(a) == len(b) and all(exact_equal(x, y) for x, y in zip(a, b))
    if ka == "object":
        return a.keys() == b.keys() and all(exact_equal(a[k], b[k]) for k in a)
    return a == b


def float_equal(a, b, tol):
    ka, kb = kind(a), kind(b)
    if ka != kb:
        return False
    if ka == "number":
        return math.isclose(a, b, rel_tol=tol, abs_tol=tol)
    if ka == "list":
        return len(a) == len(b) and all(float_equal(x, y, tol) for x, y in zip(a, b))
    if ka == "object":
        return a.keys() == b.keys() and all(float_equal(a[k], b[k], tol) for k in a)
    return a == b


def canonical(v, nested):
    if isinstance(v, list):
        items = [canonical(x, nested) for x in v] if nested else v
        return json.dumps(sorted(items, key=lambda x: json.dumps(x, sort_keys=True)), sort_keys=True)
    return json.dumps(v, sort_keys=True)


def unordered_equal(expected, actual, nested):
    if not isinstance(expected, list) or not isinstance(actual, list) or len(expected) != len(actual):
        return False
    if nested:
        return canonical(expected, True) == canonical(actual, True)
    key = lambda x: json.dumps(x, sort_keys=True)  # noqa: E731
    return all(exact_equal(x, y) for x, y in zip(sorted(expected, key=key), sorted(actual, key=key)))


def make_checker(spec):
    t = spec.get("type", "exact")
    if t == "exact":
        return lambda inp, exp, act: (exact_equal(exp, act), None)
    if t == "unordered":
        nested = bool(spec.get("nested"))
        return lambda inp, exp, act: (unordered_equal(exp, act, nested), None)
    if t == "float":
        tol = float(spec.get("tolerance", 1e-6))
        return lambda inp, exp, act: (float_equal(exp, act, tol), None)
    if t == "custom":
        ns = {"__name__": "checker"}
        exec(compile(spec["source"], "checker.py", "exec"), ns)
        fn = ns["check"]

        def custom(inp, exp, act):
            r = fn(inp, exp, act)
            if isinstance(r, tuple):
                return bool(r[0]), (str(r[1]) if len(r) > 1 and r[1] else None)
            return bool(r), None

        return custom
    raise ValueError(f"unknown checker {t}")


# ---------------------------------------------------------------------------
# DSA mode


class Driver:
    """A long-lived driver process: test inputs on stdin, results on fd 3, user output on 1 and 2."""

    def __init__(self, argv, env):
        r3, w3 = os.pipe()
        self.oom_before = oom_kills()
        self.proc = subprocess.Popen(
            argv,
            cwd=WORK,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            pass_fds=(w3, 3),  # 3 is created by the dup2 in preexec_fn; keep it open
            start_new_session=True,
            preexec_fn=lambda: (child_setup(), os.dup2(w3, 3)),
        )
        os.close(w3)
        self.results = os.fdopen(r3, "rb", buffering=0)
        self.stdout, self.stderr = CappedBuffer(), CappedBuffer()
        self.pending = bytearray()
        self.startup_rss = None
        self.carried = 0
        self.sel = selectors.DefaultSelector()
        self.sel.register(self.results, selectors.EVENT_READ, "results")
        self.sel.register(self.proc.stdout, selectors.EVENT_READ, self.stdout)
        self.sel.register(self.proc.stderr, selectors.EVENT_READ, self.stderr)

    def send(self, obj):
        try:
            self.proc.stdin.write(json.dumps(obj, separators=(",", ":")).encode() + b"\n")
            self.proc.stdin.flush()
            return True
        except (BrokenPipeError, OSError):
            return False

    def read_line(self, timeout_s):
        """Returns (line_bytes, None) or (None, "timeout" | "exited")."""
        deadline = time.monotonic() + timeout_s
        while True:
            nl = self.pending.find(b"\n")
            if nl >= 0:
                line = bytes(self.pending[:nl])
                del self.pending[: nl + 1]
                self.drain()  # user output written before the result belongs to this test
                return line, None
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None, "timeout"
            if not any(k.data == "results" for k in self.sel.get_map().values()):
                self.drain(wait=0.2)
                return None, "exited"
            for key, _ in self.sel.select(timeout=min(remaining, 0.25)):
                chunk = os.read(key.fd, 1 << 20)
                if not chunk:
                    self.sel.unregister(key.fileobj)
                elif key.data == "results":
                    self.pending += chunk
                else:
                    key.data.add(chunk)

    def drain(self, wait=0.0):
        end = time.monotonic() + wait
        while True:
            outputs = [k for k in self.sel.get_map().values() if k.data != "results"]
            if not outputs:
                return
            events = self.sel.select(timeout=max(0.0, end - time.monotonic()))
            got = False
            for key, _ in events:
                if key.data == "results":
                    continue
                chunk = os.read(key.fd, 65536)
                got = True
                if chunk:
                    key.data.add(chunk)
                else:
                    self.sel.unregister(key.fileobj)
            if not got and time.monotonic() >= end:
                return

    def peak_kb(self):
        peak = peak_rss_kb(self.proc.pid)
        return None if peak is None else max(0, peak - self.carried)

    def reset_peak(self):
        """Reset VmHWM so the next reading is this test's peak, not the process lifetime's.

        Memory leaked by earlier tests (e.g. C++ nodes that are never freed) is subtracted, so
        `peak_kb` approximates startup footprint + this test's usage.
        """
        rss = current_rss_kb(self.proc.pid)
        if self.startup_rss is None:
            self.startup_rss = rss
        self.carried = max(0, (rss or 0) - (self.startup_rss or 0))
        try:
            with open(f"/proc/{self.proc.pid}/clear_refs", "w") as f:
                f.write("5")
        except OSError:
            pass

    def death_reason(self):
        """Classify why the driver died without answering."""
        kill_group(self.proc)
        self.drain(wait=0.2)
        rc = self.proc.returncode
        after = oom_kills()
        stderr = self.stderr.take()
        oom = self.oom_before is not None and after is not None and after > self.oom_before
        if oom or any(m in stderr for m in MEMORY_ERROR_MARKERS):
            return "memory_limit_exceeded", "Killed after exceeding the memory limit.", stderr
        if rc is not None and rc < 0:
            sig = -rc
            if sig == signal.SIGKILL:
                # Only the kernel (OOM) or we send SIGKILL; we didn't.
                return "memory_limit_exceeded", "Killed after exceeding the memory limit.", stderr
            name = signal.Signals(sig).name if sig in signal.Signals._value2member_map_ else str(sig)
            hint = " (often a stack overflow or invalid memory access)" if sig == signal.SIGSEGV else ""
            return "runtime_error", f"Process terminated by {name}{hint}.", stderr
        return "runtime_error", f"Process exited with code {rc}.", stderr

    def close(self):
        kill_group(self.proc)
        self.sel.close()
        self.results.close()


def preview(value, cap=PREVIEW_CAP):
    text = json.dumps(value, separators=(",", ":"))
    return text if len(text) <= cap else text[:cap] + "…"


def run_dsa(b):
    tests = b["tests"]
    limit_ms = b["timeLimitMs"]
    wall_s = (limit_ms + b.get("wallSlackMs", 1000)) / 1000
    memory_kb = b["memoryLimitMb"] * 1024
    allowance_kb = b.get("memoryAllowanceKb", 0)
    budget_end = time.monotonic() + b["budgetMs"] / 1000
    stop_on_failure = b.get("stopOnFirstFailure", False)
    env = {**os.environ, "HOME": "/tmp", "LANG": "C.UTF-8", **b["run"].get("env", {})}

    base = {"compileOutput": None, "tests": []}

    if b.get("compile"):
        c = run_simple(b["compile"]["argv"], b["compile"]["timeoutMs"] / 1000)
        if c["timedOut"] or c["exitCode"] != 0:
            msg = "Compilation timed out." if c["timedOut"] else (c["stderr"] + c["stdout"])[:COMPILE_OUTPUT_CAP]
            return {**base, "verdict": "compile_error", "compileOutput": msg}

    checker = make_checker(b.get("checker") or {"type": "exact"})
    results = []
    driver = None
    i = 0
    while i < len(tests):
        test = tests[i]
        if time.monotonic() >= budget_end:
            break
        if driver is None:
            driver = Driver(b["run"]["argv"], env)
            line, why = driver.read_line(b.get("startupTimeoutMs", 10000) / 1000)
            if line is None:
                verdict, message, stderr = (
                    ("time_limit_exceeded", "The program did not start in time.", driver.stderr.take())
                    if why == "timeout"
                    else driver.death_reason()
                )
                driver.close()
                driver = None
                results.append(test_result(test["id"], verdict, message=message, stderr=stderr))
                i += 1
                if stop_on_failure:
                    break
                continue
            ready = json.loads(line)
            if not ready.get("ready"):
                driver.close()
                if "compileError" in ready:
                    return {**base, "verdict": "compile_error", "compileOutput": ready["compileError"][:COMPILE_OUTPUT_CAP]}
                # The user's module raised while loading: every test is a runtime error.
                results.append(test_result(test["id"], "runtime_error", message=ready.get("message", "")[:PREVIEW_CAP]))
                break

        driver.reset_peak()
        if not driver.send(test["input"]):
            verdict, message, stderr = driver.death_reason()
            driver.close()
            driver = None
            results.append(test_result(test["id"], verdict, message=message, stderr=stderr))
            i += 1
            if stop_on_failure:
                break
            continue

        line, why = driver.read_line(min(wall_s, max(0.05, budget_end - time.monotonic())))
        if line is None:
            if why == "timeout":
                driver.drain(wait=0.05)
                stdout, stderr = driver.stdout.take(), driver.stderr.take()
                driver.close()
                r = test_result(test["id"], "time_limit_exceeded", time_ms=limit_ms, stdout=stdout, stderr=stderr,
                                message=f"Exceeded the {limit_ms} ms time limit.")
            else:
                verdict, message, stderr = driver.death_reason()  # drains remaining output
                stdout = driver.stdout.take()
                driver.close()
                r = test_result(test["id"], verdict, stdout=stdout, stderr=stderr, message=message)
            driver = None
        else:
            r = judge_line(test, json.loads(line), checker, limit_ms, FULL_OUTPUT_CAP if b.get("captureFull") else PREVIEW_CAP)
            r["stdout"], r["stderr"] = driver.stdout.take(), driver.stderr.take()
            peak = driver.peak_kb()
            r["memoryKb"] = peak
            if peak is not None and peak - allowance_kb > memory_kb and r["verdict"] in ("accepted", "wrong_answer", "ran"):
                r["verdict"] = "memory_limit_exceeded"
                r["message"] = f"Used {peak // 1024} MB; the limit is {memory_kb // 1024} MB."
        results.append(r)
        i += 1
        if driver is not None and r["verdict"] not in ("accepted", "ran", "wrong_answer"):
            # Start the next test from a clean process: memory and state from a crash don't carry over.
            driver.close()
            driver = None
        if stop_on_failure and r["verdict"] not in ("accepted", "ran"):
            break

    if driver is not None:
        driver.close()

    budget = TOTAL_OUTPUT_CAP
    for r in results:
        for key in ("stdout", "stderr"):
            if len(r[key]) > budget:
                r[key] = r[key][: max(budget, 0)] + "\n…[output omitted: run output limit reached]"
            budget -= len(r[key])

    for t in tests[len(results):]:
        results.append(test_result(t["id"], "skipped"))
    return {**base, "verdict": overall(results), "tests": results}


def judge_line(test, msg, checker, limit_ms, cap):
    time_ms = msg.get("timeMs")
    if not msg.get("ok"):
        etype = msg.get("errorType", "Error")
        verdict = "memory_limit_exceeded" if any(m in etype for m in MEMORY_ERROR_MARKERS) else "runtime_error"
        return test_result(test["id"], verdict, time_ms=time_ms, message=f"{etype}: {msg.get('message', '')}"[:PREVIEW_CAP])
    actual = msg.get("output")
    if time_ms is not None and time_ms > limit_ms:
        return test_result(test["id"], "time_limit_exceeded", time_ms=time_ms, actual=preview(actual, cap),
                           message=f"Exceeded the {limit_ms} ms time limit.")
    if "expected" not in test:
        return test_result(test["id"], "ran", time_ms=time_ms, actual=preview(actual, cap))
    try:
        ok, note = checker(test["input"], test["expected"], actual)
    except Exception as e:  # a broken custom checker is a content bug; surface it
        ok, note = False, f"Checker error: {type(e).__name__}: {e}"
    return test_result(test["id"], "accepted" if ok else "wrong_answer", time_ms=time_ms, actual=preview(actual, cap), message=note)


def test_result(tid, verdict, time_ms=None, memory_kb=None, actual=None, stdout="", stderr="", message=None):
    return {
        "id": tid,
        "verdict": verdict,
        "timeMs": None if time_ms is None else round(time_ms, 2),
        "memoryKb": memory_kb,
        "actual": actual,
        "stdout": stdout,
        "stderr": stderr,
        "message": message,
    }


def overall(results):
    for r in results:
        if r["verdict"] not in ("accepted", "ran"):
            # Tests skipped because the time budget ran out count as a time limit failure.
            return "time_limit_exceeded" if r["verdict"] == "skipped" else r["verdict"]
    return "ran" if any(r["verdict"] == "ran" for r in results) else "accepted"


# ---------------------------------------------------------------------------
# Project mode


def run_project(b):
    r = run_simple(b["command"], b["timeoutMs"] / 1000, stdin_data=b.get("stdin", "").encode(), shell=True)
    r["tests"], r["resultsError"], r["files"] = None, None, collect_files(b.get("collect") or [])
    spec = b.get("results")
    if spec:
        try:
            r["tests"] = parse_results(spec)
        except Exception as e:
            r["resultsError"] = f"{type(e).__name__}: {e}"[:PREVIEW_CAP]
    return r


def collect_files(paths):
    out, total = {}, 0
    for rel in paths:
        path = os.path.normpath(os.path.join(WORK, rel))
        if not path.startswith(WORK + "/") or not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(COLLECT_CAP - total + 1)
        if total + len(text) > COLLECT_CAP:
            break
        out[rel] = text
        total += len(text)
    return out


def parse_results(spec):
    paths = sorted(glob.glob(os.path.join(WORK, spec["path"]), recursive=True))
    if not paths:
        raise FileNotFoundError(f"no results at {spec['path']}")
    tests = []
    for p in paths:
        if spec["format"] == "junit":
            tests += parse_junit(p)
        else:
            with open(p) as f:
                for t in json.load(f)["tests"]:
                    tests.append({
                        "name": str(t["name"]),
                        "classname": str(t.get("classname", "")),
                        "status": t["status"],
                        "message": t.get("message"),
                        "timeMs": t.get("timeMs"),
                    })
    return tests


def parse_junit(path):
    out = []
    for case in ET.parse(path).getroot().iter("testcase"):
        status, message = "passed", None
        for tag in ("failure", "error", "skipped"):
            el = case.find(tag)
            if el is not None:
                status = {"failure": "failed", "error": "error", "skipped": "skipped"}[tag]
                message = (el.get("message") or "") + ("\n" + el.text.strip() if el.text and el.text.strip() else "")
                message = message.strip()[:PREVIEW_CAP] or None
                break
        t = case.get("time")
        out.append({
            "name": case.get("name", ""),
            "classname": case.get("classname", ""),
            "status": status,
            "message": message,
            "timeMs": round(float(t) * 1000, 2) if t else None,
        })
    return out


# ---------------------------------------------------------------------------
# Self-test (run by compose when the image is installed)

SELFTESTS = {
    "python": [["python3", "-c", "import pytest, sys; assert sys.version_info[:2] == (3, 12)"]],
    "cpp": [["g++", "--version"], ["test", "-f", "/sandbox/cpp/swemock.hpp.gch"], ["test", "-f", "/sandbox/cpp/doctest.h"]],
}


def selftest(lang):
    for argv in SELFTESTS[lang]:
        r = subprocess.run(argv, capture_output=True)
        if r.returncode != 0:
            print(f"selftest failed: {' '.join(argv)}\n{r.stderr.decode(errors='replace')}", file=sys.stderr)
            return 1
    print(f"swemock sandbox ({lang}) ok")
    return 0


def write_files(files):
    for rel, content in files.items():
        path = os.path.normpath(os.path.join(WORK, rel))
        if not path.startswith(WORK + "/"):
            raise ValueError(f"path escapes /work: {rel}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--selftest":
        return selftest(sys.argv[2])
    make_undumpable()
    try:
        bundle = json.load(sys.stdin)
        write_files(bundle.get("files", {}))
        if bundle["mode"] == "dsa":
            result = run_dsa(bundle)
        elif bundle["mode"] == "project":
            result = run_project(bundle)
        else:
            raise ValueError(f"unknown mode {bundle['mode']}")
        out = {"ok": True, "result": result}
    except Exception as e:
        out = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    sys.stdout.write("\n" + json.dumps(out, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
