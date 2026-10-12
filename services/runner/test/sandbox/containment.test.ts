/**
 * Containment tests (spec §14 M1): infinite loop, fork bomb, memory hog, network attempt, and file
 * writes outside /work must all be contained, and every container must be removed afterwards.
 */
import { afterAll, describe, expect, it } from "vitest";
import { SANDBOX_LABEL } from "../../src/sandbox";
import { addSig, docker, dsa, project } from "./helpers";

const probe = (code: string, timeoutMs = 20_000) =>
  project({ language: "python", files: { "probe.py": code }, command: { kind: "runFile", path: "probe.py" }, timeoutMs });

afterAll(async () => {
  expect(await docker.listByLabel(SANDBOX_LABEL)).toEqual([]);
});

describe("containment", () => {
  it("kills an infinite loop at the time limit", async () => {
    const started = Date.now();
    const r = await dsa({
      language: "cpp",
      code: "class Solution { public: int add(int a, int b) { volatile int x = 0; for (;;) x++; } };",
      signature: addSig,
      tests: [{ id: "1", input: { a: 1, b: 1 }, expected: 2 }],
      timeLimitMs: 1000,
    });
    expect(r.verdict).toBe("time_limit_exceeded");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("contains a fork bomb with the pids limit", async () => {
    const started = Date.now();
    const r = await probe(
      [
        "import os, time",
        "n = 0",
        "try:",
        "    while True:",
        "        if os.fork() == 0:",
        "            time.sleep(30)",
        "            os._exit(0)",
        "        n += 1",
        "except OSError as e:",
        "    print('fork failed after', n, type(e).__name__)",
      ].join("\n"),
      10_000,
    );
    expect(r.stdout).toMatch(/fork failed after \d+ BlockingIOError/);
    const forked = Number(/after (\d+)/.exec(r.stdout)![1]);
    expect(forked).toBeLessThan(64);
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it("contains a C++ fork bomb that never stops trying", async () => {
    const r = await project({
      language: "cpp",
      files: { "bomb.cpp": "#include <unistd.h>\nint main() { for (;;) fork(); }\n" },
      command: { kind: "runFile", path: "bomb.cpp" },
      timeoutMs: 5000,
    });
    expect(r.timedOut).toBe(true);
  });

  it("stops a memory hog at the container limit", async () => {
    const r = await probe(
      [
        "chunks = []",
        "try:",
        "    for i in range(64):",
        "        chunks.append(bytearray(64 * 1024 * 1024))",
        "        print('allocated', (i + 1) * 64, 'MB', flush=True)",
        "except MemoryError:",
        "    print('MemoryError')",
      ].join("\n"),
    );
    // Either the kernel OOM-kills it or Python raises; it never gets near 4GB.
    expect(r.oomKilled || r.stdout.includes("MemoryError") || r.exitCode === -9).toBe(true);
    const last = Math.max(0, ...[...r.stdout.matchAll(/allocated (\d+) MB/g)].map((m) => Number(m[1])));
    expect(last).toBeLessThan(1024);
  });

  it("has no network access", async () => {
    const r = await probe(
      [
        "import socket",
        "for host, port in [('1.1.1.1', 53), ('8.8.8.8', 443), ('host.docker.internal', 80), ('example.com', 80)]:",
        "    try:",
        "        socket.create_connection((host, port), timeout=3)",
        "        print('CONNECTED', host)",
        "    except OSError as e:",
        "        print('blocked', host, type(e).__name__)",
        // Some kernels add down, address-less tunnel interfaces to every namespace; what matters is no routes.
        "print('routes', len(open('/proc/net/route').read().strip().splitlines()) - 1)",
      ].join("\n"),
    );
    expect(r.stdout).not.toContain("CONNECTED");
    expect(r.stdout.match(/blocked/g)).toHaveLength(4);
    expect(r.stdout).toContain("routes 0");
  });

  it("cannot write outside /work and /tmp", async () => {
    const r = await probe(
      [
        "import os",
        "for p in ['/x', '/etc/x', '/usr/x', '/sandbox/x', '/home/x', '/var/x', '/proc/x', '/sys/x']:",
        "    try:",
        "        open(p, 'w').write('x')",
        "        print('WROTE', p)",
        "    except OSError as e:",
        "        print('denied', p, e.errno)",
        "open('/work/ok.txt', 'w').write('fine')",
        "open('/tmp/ok.txt', 'w').write('fine')",
        "print('work and tmp writable')",
      ].join("\n"),
    );
    expect(r.stdout).not.toContain("WROTE");
    expect(r.stdout.match(/denied/g)).toHaveLength(8);
    expect(r.stdout).toContain("work and tmp writable");
  });

  it("runs unprivileged: nobody, no capabilities, no-new-privileges, isolated PIDs, no Docker socket", async () => {
    const r = await probe(
      [
        "import os",
        "status = dict(l.split(':', 1) for l in open('/proc/self/status') if ':' in l)",
        "print('uid', os.getuid(), os.getgid())",
        "print('capeff', status['CapEff'].strip())",
        "print('capbnd', status['CapBnd'].strip())",
        "print('nonewprivs', status['NoNewPrivs'].strip())",
        "print('seccomp', status['Seccomp'].strip())",
        "print('pids', len([p for p in os.listdir('/proc') if p.isdigit()]))",
        "print('socket', os.path.exists('/var/run/docker.sock'))",
        "try:\n    open('/tmp/x.sh', 'w').write('#!/bin/sh\\necho ran')\n    os.chmod('/tmp/x.sh', 0o755)\n    os.execv('/tmp/x.sh', ['x'])\nexcept OSError as e:\n    print('tmp noexec', e.errno)",
      ].join("\n"),
    );
    expect(r.stdout).toContain("uid 65534 65534");
    expect(r.stdout).toContain("capeff 0000000000000000");
    expect(r.stdout).toContain("capbnd 0000000000000000");
    expect(r.stdout).toContain("nonewprivs 1");
    expect(r.stdout).toContain("seccomp 2");
    expect(Number(/pids (\d+)/.exec(r.stdout)![1])).toBeLessThan(10);
    expect(r.stdout).toContain("socket False");
    expect(r.stdout).toContain("tmp noexec 13");
  });

  it("hides the agent's memory and file descriptors from user code", async () => {
    const r = await probe(
      [
        "import os",
        "for p in ['/proc/1/fd', '/proc/1/mem', '/proc/1/environ']:",
        "    try:",
        "        os.listdir(p) if p.endswith('fd') else open(p, 'rb').read(1)",
        "        print('READ', p)",
        "    except OSError as e:",
        "        print('denied', p)",
      ].join("\n"),
    );
    expect(r.stdout).not.toContain("READ");
  });
});
