import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { attachAndroidViewer, closeAndroidStream, type StreamViewer } from "../../src/android-stream";

const version = process.argv[2]!;
const modern = Number.parseInt(version, 10) >= 4;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "simfleet-stream-test-"));
const sockets: net.Socket[] = [];
const messages: unknown[] = [];
const meta = (width: number, height: number) => ({ type: "meta", width, height, name: "Test device" });

function collect(target: unknown[]): StreamViewer {
  return { send: (data) => target.push(typeof data === "string" ? JSON.parse(data) : data), close() {} };
}

function words(...values: number[]) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeUInt32BE(value, index * 4));
  return bytes;
}

// Wire contract: scrcpy v3.3.4/v4.1 Streamer.java and app/src/demuxer.c.
// In v4, a session is three u32 words (flags, width, height), with no payload.
const session = (width: number, height: number) => words(0x80000000, width, height);
function frame(flag: "config" | "key" | "delta", payload: number[]) {
  const header = Buffer.alloc(12);
  const flags = modern ? { config: 0x40, key: 0x20, delta: 0 } : { config: 0x80, key: 0x40, delta: 0 };
  header[0] = flags[flag];
  if (flag !== "config") header.writeUInt32BE(123456, 4); // non-zero PTS
  header.writeUInt32BE(payload.length, 8);
  return Buffer.concat([header, Buffer.from(payload)]);
}

async function fragmented(socket: net.Socket, bytes: Uint8Array) {
  // Split metadata, packet headers and payloads across TCP writes.
  for (let offset = 0; offset < bytes.length; offset += 7) {
    socket.write(bytes.subarray(offset, offset + 7));
    await Bun.sleep(1);
  }
}

async function received(target: Array<unknown>, count: number) {
  const deadline = Date.now() + 1500;
  while (target.length < count && Date.now() < deadline) await Bun.sleep(5);
  assert.equal(target.length, count, "viewer should receive the expected messages");
}

const server = net.createServer((socket) => {
  sockets.push(socket);
  if (sockets.length !== 1) return; // second connection is the control channel
  const name = Buffer.alloc(64);
  name.write("Test device");
  const codec = modern ? words(0x68323634) : words(0x68323634, 1280, 720);
  void fragmented(socket, Buffer.concat([Buffer.from([0]), name, codec, ...(modern ? [session(1280, 720)] : [])]));
});

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as net.AddressInfo).port;
  // Exercise normal discovery and attach, replacing only the external adb tool.
  // No host adb command or emulator is used by this fixture.
  fs.writeFileSync(path.join(root, "adb"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "devices") console.log("List of devices attached\\nemulator-5554\\tdevice");
else if (args.includes("app_process")) setInterval(() => {}, 60000);
else if (args.includes("forward")) {
  if (!args.includes("--remove")) console.log(${port});
} else if (args.includes("emu")) console.log("Stream_Test\\nOK");
else if (args.includes("getprop")) console.log("1");
else if (args.includes("ls")) console.log(args[args.length - 1]);
else process.exit(1);
`, { mode: 0o755 });
  process.env.PATH = root;
  delete process.env.AVDSLIM_BIN;
  process.env.SCRCPY_SERVER_PATH = path.join(root, "scrcpy-server");
  process.env.SCRCPY_SERVER_VERSION = version;
  fs.writeFileSync(process.env.SCRCPY_SERVER_PATH, "fixture");

  await attachAndroidViewer("Stream_Test", collect(messages));
  await received(messages, 1);
  assert.deepEqual(messages[0], meta(1280, 720), "initial video dimensions");

  const config = [0, 0, 0, 1, 0x67, 0x64, 0, 0x1f];
  const key = [0, 0, 0, 1, 0x65, 0x88];
  const delta = [0, 0, 0, 1, 0x41, 0x99];
  await fragmented(sockets[0]!, Buffer.concat([frame("config", config), frame("key", key), frame("delta", delta)]));
  await received(messages, 4);
  assert.deepEqual(messages.slice(1), [new Uint8Array([1, ...config]), new Uint8Array([2, ...key]), new Uint8Array([0, ...delta])]);

  const late: unknown[] = [];
  await attachAndroidViewer("Stream_Test", collect(late));
  assert.deepEqual(late, [meta(1280, 720), new Uint8Array([1, ...config])], "late viewers receive cached config");

  if (modern) {
    await fragmented(sockets[0]!, session(720, 1280));
    await received(messages, 5);
    assert.deepEqual(messages[4], meta(720, 1280), "session packets update dimensions without consuming a media payload");
    const afterResize: unknown[] = [];
    await attachAndroidViewer("Stream_Test", collect(afterResize));
    assert.deepEqual(afterResize, [meta(720, 1280)], "a new session must not replay stale codec config");
    const nextConfig = [0, 0, 0, 1, 0x67, 0x42, 0, 0x1e];
    await fragmented(sockets[0]!, Buffer.concat([frame("config", nextConfig), frame("key", key)]));
    await received(afterResize, 3);
    assert.deepEqual(afterResize.slice(1), [new Uint8Array([1, ...nextConfig]), new Uint8Array([2, ...key])]);
  }
} finally {
  closeAndroidStream("Stream_Test");
  await Bun.sleep(50);
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
