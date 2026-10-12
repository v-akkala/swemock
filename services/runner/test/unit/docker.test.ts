import { describe, expect, it } from "vitest";
import { socketPathFromEnv, StreamDemuxer } from "../../src/docker";

function frame(kind: number, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = kind;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe("StreamDemuxer", () => {
  it("splits stdout and stderr frames, even across chunk boundaries", () => {
    const d = new StreamDemuxer(1024);
    const all = Buffer.concat([frame(1, "hello "), frame(2, "oops"), frame(1, "world")]);
    for (let i = 0; i < all.length; i += 3) d.push(all.subarray(i, i + 3));
    expect(d.text("stdout")).toBe("hello world");
    expect(d.text("stderr")).toBe("oops");
    expect(d.overflow).toBe(false);
  });

  it("caps each stream and flags overflow", () => {
    const d = new StreamDemuxer(4);
    d.push(frame(1, "abcdefgh"));
    expect(d.text("stdout")).toBe("abcd");
    expect(d.overflow).toBe(true);
  });
});

describe("socketPathFromEnv", () => {
  it("uses DOCKER_HOST unix sockets and defaults to /var/run/docker.sock", () => {
    expect(socketPathFromEnv({ DOCKER_HOST: "unix:///tmp/d.sock" })).toBe("/tmp/d.sock");
    expect(socketPathFromEnv({})).toBe("/var/run/docker.sock");
  });
});
