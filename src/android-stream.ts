import fs from "node:fs";
import type { Socket } from "bun";
import { ANDROID_BUTTON_KEYCODES, W3C_KEYCODES, requireSerial, type AndroidButton } from "./android";
import { run } from "./system";

/**
 * Live Android video and input over scrcpy's device server. Screenshot polling
 * (a 1.2 MB PNG per frame, ~0.5 s each) plus one `adb shell input` process per
 * gesture made emulators feel laggy; this streams hardware-encoded H.264 frames
 * as they change and injects touch down/move/up directly, so drags and scrolls
 * track the pointer.
 *
 * One scrcpy session per emulator is shared by every dashboard viewer. A viewer
 * that joins mid-stream asks the encoder to restart, which re-sends the codec
 * config and a key frame.
 */

const PACKET_FLAG_CONFIG = 1n << 63n;
const PACKET_FLAG_KEY_FRAME = 1n << 62n;
const DEVICE_NAME_LENGTH = 64;
const POINTER_ID_GENERIC_FINGER = -2n;
const IDLE_CLOSE_MS = 5_000;

const MSG_INJECT_KEYCODE = 0;
const MSG_INJECT_TEXT = 1;
const MSG_INJECT_TOUCH = 2;
const MSG_INJECT_SCROLL = 3;
const MSG_RESET_VIDEO = 17;

const TOUCH_ACTIONS = { down: 0, up: 1, move: 2, cancel: 3 } as const;

export type StreamViewer = {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
};

type Scrcpy = { serverPath: string; version: string };

let scrcpyCache: Scrcpy | null | undefined;

async function findScrcpy(): Promise<Scrcpy | null> {
  if (scrcpyCache !== undefined) return scrcpyCache;
  const candidates = [
    process.env.SCRCPY_SERVER_PATH,
    "/opt/homebrew/share/scrcpy/scrcpy-server",
    "/usr/local/share/scrcpy/scrcpy-server",
  ].filter((candidate): candidate is string => Boolean(candidate));
  const serverPath = candidates.find((candidate) => fs.existsSync(candidate));
  // The device server only accepts a client of exactly its own version.
  const version =
    process.env.SCRCPY_SERVER_VERSION ||
    (await run("scrcpy", ["--version"], { timeoutMs: 5_000 }).catch(() => null))?.stdout.match(
      /scrcpy (\d+\.\d+(?:\.\d+)?)/,
    )?.[1];
  scrcpyCache = serverPath && version ? { serverPath, version } : null;
  return scrcpyCache;
}

export async function androidStreamAvailable(): Promise<boolean> {
  return (await findScrcpy()) !== null;
}

/** Accumulates socket chunks and hands out exact-length reads. */
class ByteQueue {
  private chunks: Uint8Array[] = [];
  private length = 0;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  get size() {
    return this.length;
  }

  peek(count: number): Uint8Array | null {
    if (this.length < count) return null;
    const out = new Uint8Array(count);
    let offset = 0;
    for (const chunk of this.chunks) {
      const take = Math.min(chunk.length, count - offset);
      out.set(chunk.subarray(0, take), offset);
      offset += take;
      if (offset === count) break;
    }
    return out;
  }

  take(count: number): Uint8Array | null {
    const out = this.peek(count);
    if (!out) return null;
    let remaining = count;
    while (remaining > 0) {
      const head = this.chunks[0]!;
      if (head.length <= remaining) {
        this.chunks.shift();
        remaining -= head.length;
      } else {
        this.chunks[0] = head.subarray(remaining);
        remaining = 0;
      }
    }
    this.length -= count;
    return out;
  }
}

type ViewerMessage =
  | { type: "touch"; action: keyof typeof TOUCH_ACTIONS; x: number; y: number; width: number; height: number }
  | { type: "scroll"; x: number; y: number; width: number; height: number; dx: number; dy: number }
  | { type: "key"; code: string }
  | { type: "text"; text: string }
  | { type: "button"; button: AndroidButton }
  | { type: "reset" };

function clampI16Fixed(value: number): number {
  // scrcpy decodes scroll as i16 fixed point over [-1, 1], scaled by 16.
  const normalized = Math.max(-1, Math.min(1, value / 16));
  return Math.max(-0x8000, Math.min(0x7fff, Math.round(normalized * 0x8000)));
}

export function encodeTouch(
  action: keyof typeof TOUCH_ACTIONS,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);
  view.setUint8(0, MSG_INJECT_TOUCH);
  view.setUint8(1, TOUCH_ACTIONS[action]);
  view.setBigInt64(2, POINTER_ID_GENERIC_FINGER);
  view.setInt32(10, Math.round(x));
  view.setInt32(14, Math.round(y));
  view.setUint16(18, width);
  view.setUint16(20, height);
  view.setUint16(22, action === "up" || action === "cancel" ? 0 : 0xffff);
  view.setInt32(24, 0); // action button
  view.setInt32(28, 0); // buttons
  return buffer;
}

export function encodeScroll(x: number, y: number, width: number, height: number, dx: number, dy: number): Uint8Array {
  const buffer = new Uint8Array(21);
  const view = new DataView(buffer.buffer);
  view.setUint8(0, MSG_INJECT_SCROLL);
  view.setInt32(1, Math.round(x));
  view.setInt32(5, Math.round(y));
  view.setUint16(9, width);
  view.setUint16(11, height);
  view.setInt16(13, clampI16Fixed(dx));
  view.setInt16(15, clampI16Fixed(dy));
  view.setInt32(17, 0);
  return buffer;
}

export function encodeKeycode(action: "down" | "up", keycode: number): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);
  view.setUint8(0, MSG_INJECT_KEYCODE);
  view.setUint8(1, action === "down" ? 0 : 1);
  view.setInt32(2, keycode);
  view.setInt32(6, 0);
  view.setInt32(10, 0);
  return buffer;
}

export function encodeText(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text.slice(0, 300));
  const buffer = new Uint8Array(5 + bytes.length);
  const view = new DataView(buffer.buffer);
  view.setUint8(0, MSG_INJECT_TEXT);
  view.setUint32(1, bytes.length);
  buffer.set(bytes, 5);
  return buffer;
}

class ScrcpySession {
  readonly viewers = new Set<StreamViewer>();
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private video: Socket<undefined> | null = null;
  private control: Socket<undefined> | null = null;
  private videoQueue = new ByteQueue();
  private stage: "dummy" | "name" | "codec" | "frames" = "dummy";
  private config: Uint8Array | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  meta: { width: number; height: number; name: string } | null = null;

  constructor(
    readonly avd: string,
    private adbPath: string,
    readonly serial: string,
    private forwardPort: number,
    private onClosed: () => void,
  ) {}

  async connect(scrcpy: Scrcpy, remoteJar: string, scid: string) {
    this.process = Bun.spawn(
      [
        this.adbPath,
        "-s",
        this.serial,
        "shell",
        `CLASSPATH=${remoteJar}`,
        "app_process",
        "/",
        "com.genymobile.scrcpy.Server",
        scrcpy.version,
        `scid=${scid}`,
        "log_level=warn",
        "tunnel_forward=true",
        "audio=false",
        "control=true",
        "video_codec=h264",
        "max_size=1280",
        "max_fps=60",
        "video_bit_rate=6000000",
        "clipboard_autosync=false",
        "power_on=true",
        "cleanup=true",
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    void this.process.exited.then(() => this.close("scrcpy server exited"));

    // The adb forward accepts connections before the device server listens;
    // the dummy byte proves the video socket reached it.
    const deadline = Date.now() + 10_000;
    while (!this.closed) {
      const socket = await this.openVideoSocket().catch(() => null);
      if (socket) {
        this.video = socket;
        break;
      }
      if (Date.now() > deadline) throw new Error("scrcpy server did not accept a connection");
      await Bun.sleep(150);
    }
    if (this.closed) throw new Error("scrcpy session closed during connect");
    this.control = await Bun.connect({
      hostname: "127.0.0.1",
      port: this.forwardPort,
      socket: {
        // Device messages (clipboard, UHID output) are not used; drain them.
        data() {},
        close: () => this.close("control socket closed"),
        error: () => this.close("control socket failed"),
      },
    });
  }

  private openVideoSocket(): Promise<Socket<undefined>> {
    return new Promise((resolve, reject) => {
      let settled = false;
      void Bun.connect({
        hostname: "127.0.0.1",
        port: this.forwardPort,
        socket: {
          data: (socket, chunk) => {
            if (!settled) {
              settled = true;
              resolve(socket);
            }
            this.videoQueue.push(new Uint8Array(chunk));
            this.pumpVideo();
          },
          close: () => {
            if (!settled) {
              settled = true;
              reject(new Error("closed before dummy byte"));
            } else {
              this.close("video socket closed");
            }
          },
          error: () => {
            if (!settled) {
              settled = true;
              reject(new Error("video socket failed"));
            }
          },
        },
      }).catch((error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });
  }

  private pumpVideo() {
    for (;;) {
      if (this.stage === "dummy") {
        if (!this.videoQueue.take(1)) return;
        this.stage = "name";
      } else if (this.stage === "name") {
        const name = this.videoQueue.take(DEVICE_NAME_LENGTH);
        if (!name) return;
        this.meta = { width: 0, height: 0, name: new TextDecoder().decode(name).replace(/\0.*$/s, "") };
        this.stage = "codec";
      } else if (this.stage === "codec") {
        const codec = this.videoQueue.take(12);
        if (!codec) return;
        const view = new DataView(codec.buffer);
        this.meta = { ...this.meta!, width: view.getUint32(4), height: view.getUint32(8) };
        this.broadcast(JSON.stringify({ type: "meta", ...this.meta }));
        this.stage = "frames";
      } else {
        const header = this.videoQueue.peek(12);
        if (!header) return;
        const view = new DataView(header.buffer);
        const size = view.getUint32(8);
        if (this.videoQueue.size < 12 + size) return;
        this.videoQueue.take(12);
        const payload = this.videoQueue.take(size)!;
        const ptsAndFlags = view.getBigUint64(0);
        const isConfig = (ptsAndFlags & PACKET_FLAG_CONFIG) !== 0n;
        const isKey = (ptsAndFlags & PACKET_FLAG_KEY_FRAME) !== 0n;
        if (isConfig) this.config = payload;
        const packet = new Uint8Array(1 + payload.length);
        packet[0] = (isConfig ? 1 : 0) | (isKey ? 2 : 0);
        packet.set(payload, 1);
        this.broadcast(packet);
      }
    }
  }

  private broadcast(data: string | Uint8Array) {
    for (const viewer of this.viewers) {
      try {
        viewer.send(data);
      } catch {
        this.viewers.delete(viewer);
      }
    }
  }

  addViewer(viewer: StreamViewer) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.viewers.add(viewer);
    if (this.meta?.width) {
      viewer.send(JSON.stringify({ type: "meta", ...this.meta }));
      // A late joiner needs SPS/PPS and a key frame before it can decode.
      if (this.config) {
        const packet = new Uint8Array(1 + this.config.length);
        packet[0] = 1;
        packet.set(this.config, 1);
        viewer.send(packet);
      }
      this.sendControl(new Uint8Array([MSG_RESET_VIDEO]));
    }
  }

  removeViewer(viewer: StreamViewer) {
    this.viewers.delete(viewer);
    if (this.viewers.size === 0 && !this.idleTimer) {
      this.idleTimer = setTimeout(() => this.close("no viewers"), IDLE_CLOSE_MS);
    }
  }

  private sendControl(data: Uint8Array) {
    this.control?.write(data);
  }

  handle(message: ViewerMessage) {
    switch (message.type) {
      case "touch":
        if (!(message.action in TOUCH_ACTIONS)) return;
        this.sendControl(encodeTouch(message.action, message.x, message.y, message.width, message.height));
        return;
      case "scroll":
        this.sendControl(encodeScroll(message.x, message.y, message.width, message.height, message.dx, message.dy));
        return;
      case "key": {
        const keycode = W3C_KEYCODES[message.code];
        if (keycode === undefined) return;
        this.sendControl(encodeKeycode("down", keycode));
        this.sendControl(encodeKeycode("up", keycode));
        return;
      }
      case "button": {
        const keycode = ANDROID_BUTTON_KEYCODES[message.button];
        if (keycode === undefined) return;
        this.sendControl(encodeKeycode("down", keycode));
        this.sendControl(encodeKeycode("up", keycode));
        return;
      }
      case "text":
        if (message.text) this.sendControl(encodeText(message.text));
        return;
      case "reset":
        this.sendControl(new Uint8Array([MSG_RESET_VIDEO]));
        return;
    }
  }

  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const viewer of this.viewers) {
      try {
        viewer.close(1011, reason.slice(0, 120));
      } catch {
        // Already closed.
      }
    }
    this.viewers.clear();
    this.video?.end();
    this.control?.end();
    try {
      this.process?.kill();
    } catch {
      // Already exited.
    }
    void run(this.adbPath, ["-s", this.serial, "forward", "--remove", `tcp:${this.forwardPort}`], {
      timeoutMs: 5_000,
    }).catch(() => undefined);
    this.onClosed();
  }
}

const sessions = new Map<string, Promise<ScrcpySession>>();

async function startSession(avd: string): Promise<ScrcpySession> {
  const scrcpy = await findScrcpy();
  if (!scrcpy) throw new Error("scrcpy is not installed (brew install scrcpy)");
  const { adbPath, serial } = await requireSerial(avd);
  const remoteJar = `/data/local/tmp/simfleet-scrcpy-${scrcpy.version}.jar`;
  const present = await run(adbPath, ["-s", serial, "shell", "ls", remoteJar], { timeoutMs: 5_000 });
  if (present.exitCode !== 0 || !present.stdout.includes(remoteJar)) {
    const pushed = await run(adbPath, ["-s", serial, "push", scrcpy.serverPath, remoteJar], { timeoutMs: 30_000 });
    if (pushed.exitCode !== 0) throw new Error(`Could not push scrcpy server: ${pushed.stderr.trim()}`);
  }
  const scid = Math.floor(Math.random() * 0x7fffffff)
    .toString(16)
    .padStart(8, "0");
  const forward = await run(adbPath, ["-s", serial, "forward", "tcp:0", `localabstract:scrcpy_${scid}`], {
    timeoutMs: 5_000,
  });
  const port = Number(forward.stdout.trim());
  if (forward.exitCode !== 0 || !port) throw new Error(`adb forward failed: ${forward.stderr.trim()}`);
  const session = new ScrcpySession(avd, adbPath, serial, port, () => sessions.delete(avd));
  try {
    await session.connect(scrcpy, remoteJar, scid);
  } catch (error) {
    session.close("connect failed");
    throw error;
  }
  return session;
}

export async function attachAndroidViewer(avd: string, viewer: StreamViewer): Promise<ScrcpySession> {
  let pending = sessions.get(avd);
  if (!pending) {
    pending = startSession(avd);
    sessions.set(avd, pending);
    pending.catch(() => sessions.delete(avd));
  }
  const session = await pending;
  session.addViewer(viewer);
  return session;
}

export function detachAndroidViewer(avd: string, viewer: StreamViewer) {
  void sessions.get(avd)?.then((session) => session.removeViewer(viewer), () => undefined);
}

export function handleAndroidViewerMessage(avd: string, raw: string) {
  let message: ViewerMessage;
  try {
    message = JSON.parse(raw) as ViewerMessage;
  } catch {
    return;
  }
  void sessions.get(avd)?.then((session) => session.handle(message), () => undefined);
}

/** Tear down a session when its emulator shuts down. */
export function closeAndroidStream(avd: string) {
  void sessions.get(avd)?.then((session) => session.close("emulator stopped"), () => undefined);
}
