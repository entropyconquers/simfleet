import { androidStreamUrl, screenshotUrl } from "./api";
import type { StreamStatus } from "./ios-stream";

type Hooks = {
  onStatus?: (status: StreamStatus) => void;
  onFrame?: (width: number, height: number, first: boolean) => void;
  onStats?: (fps: number) => void;
  onMode?: (mode: "video" | "poll") => void;
};

export type TouchAction = "down" | "move" | "up" | "cancel";

/** `avc1.PPCCLL` from the first SPS NAL unit in an Annex B buffer. */
function avcCodecString(data: Uint8Array): string | null {
  for (let i = 0; i + 4 < data.length; i++) {
    const startCode3 = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1;
    if (!startCode3) continue;
    const nal = i + 3;
    if ((data[nal]! & 0x1f) === 7 && nal + 3 < data.length) {
      const hex = (value: number) => value.toString(16).padStart(2, "0");
      return `avc1.${hex(data[nal + 1]!)}${hex(data[nal + 2]!)}${hex(data[nal + 3]!)}`;
    }
  }
  return null;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const VIDEO_SUPPORTED = typeof window !== "undefined" && "VideoDecoder" in window;

/**
 * Live Android screen: H.264 from the fleet's scrcpy bridge, decoded with
 * WebCodecs, with touch down/move/up sent back on the same socket. Falls back
 * to polling PNG screenshots when WebCodecs or scrcpy is unavailable.
 */
export class AndroidStream {
  private ws: WebSocket | null = null;
  private decoder: VideoDecoder | null = null;
  private codec: string | null = null;
  private config: Uint8Array | null = null;
  private needKey = true;
  private wanted = false;
  private attempt = 0;
  private everConnected = false;
  private timer = 0;
  private pending: VideoFrame | null = null;
  private raf = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private pts = 0;
  private ctx: CanvasRenderingContext2D | null;
  private pollInFlight = false;
  private pollIntervalMs = 1750;
  private pollFailures = 0;
  /** Current video size; touch coordinates must use it exactly. */
  videoSize = { width: 0, height: 0 };
  mode: "video" | "poll" = VIDEO_SUPPORTED ? "video" : "poll";
  status: StreamStatus = "idle";
  hasFrame = false;

  constructor(
    readonly avd: string,
    readonly canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext("2d");
  }

  /** True when pointer input can go straight to the device over the socket. */
  get canControl(): boolean {
    return this.mode === "video" && this.ws?.readyState === WebSocket.OPEN && this.videoSize.width > 0;
  }

  start() {
    this.wanted = true;
    if (this.mode === "video") {
      if (!this.ws) this.open();
    } else if (!this.timer && !this.pollInFlight) {
      void this.poll();
    }
  }

  stop(reason: StreamStatus = "paused") {
    this.wanted = false;
    clearTimeout(this.timer);
    this.timer = 0;
    this.closeSocket();
    this.stopFpsMeter();
    this.setStatus(this.hasFrame ? reason : "idle");
  }

  destroy() {
    this.stop("idle");
    if (this.raf) cancelAnimationFrame(this.raf);
    this.pending?.close();
    this.pending = null;
  }

  /** Poll cadence for the screenshot fallback. */
  setInterval(ms: number) {
    this.pollIntervalMs = ms;
  }

  refresh() {
    if (this.mode === "video") {
      if (this.ws) this.sendJson({ type: "reset" });
      else this.retryNow();
    } else if (this.wanted && !this.pollInFlight) {
      clearTimeout(this.timer);
      this.timer = 0;
      void this.poll();
    }
  }

  retryNow() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.attempt = 0;
    if (this.mode === "video" && this.wanted && !this.ws) this.open();
    else if (this.mode === "poll") this.refresh();
  }

  /** Touch at a fraction (0–1) of the screen. */
  touch(action: TouchAction, fx: number, fy: number) {
    const { width, height } = this.videoSize;
    if (!width) return;
    this.sendJson({
      type: "touch",
      action,
      x: Math.round(Math.min(1, Math.max(0, fx)) * (width - 1)),
      y: Math.round(Math.min(1, Math.max(0, fy)) * (height - 1)),
      width,
      height,
    });
  }

  /** Scroll wheel at a fraction of the screen; dx/dy in scrcpy units (±16). */
  scroll(fx: number, fy: number, dx: number, dy: number) {
    const { width, height } = this.videoSize;
    if (!width) return;
    this.sendJson({ type: "scroll", x: Math.round(fx * width), y: Math.round(fy * height), width, height, dx, dy });
  }

  key(code: string) {
    this.sendJson({ type: "key", code });
  }

  text(text: string) {
    this.sendJson({ type: "text", text });
  }

  private sendJson(payload: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  private setStatus(status: StreamStatus) {
    if (this.status === status) return;
    this.status = status;
    this.hooks.onStatus?.(status);
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
    this.resetDecoder();
  }

  private resetDecoder() {
    if (this.decoder && this.decoder.state !== "closed") {
      try {
        this.decoder.close();
      } catch {
        // Already closed.
      }
    }
    this.decoder = null;
    this.codec = null;
    this.needKey = true;
  }

  private open() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(androidStreamUrl(this.avd));
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    let gotMeta = false;
    this.setStatus(this.hasFrame ? "reconnecting" : "connecting");
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data) as { type: string; width?: number; height?: number };
          if (message.type === "meta" && message.width && message.height) {
            gotMeta = true;
            this.everConnected = true;
            this.attempt = 0;
            this.videoSize = { width: message.width, height: message.height };
            this.startFpsMeter();
          }
        } catch {
          // Not JSON; ignore.
        }
        return;
      }
      this.onPacket(new Uint8Array(event.data as ArrayBuffer));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.resetDecoder();
      this.stopFpsMeter();
      if (!this.wanted) return;
      // scrcpy missing or the bridge never produced video: use screenshots.
      if (!gotMeta && !this.everConnected && this.attempt >= 2) {
        this.switchToPolling();
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows.
    };
  }

  private switchToPolling() {
    this.mode = "poll";
    this.hooks.onMode?.("poll");
    this.attempt = 0;
    if (this.wanted) void this.poll();
  }

  private scheduleReconnect() {
    const delay = Math.min(15000, 700 * 2 ** this.attempt) + Math.random() * 300;
    this.attempt = Math.min(this.attempt + 1, 6);
    this.setStatus(this.hasFrame ? "reconnecting" : this.attempt >= 4 ? "unavailable" : "connecting");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.wanted && !this.ws) this.open();
    }, delay);
  }

  private onPacket(packet: Uint8Array) {
    const flags = packet[0]!;
    const payload = packet.subarray(1);
    if (flags & 1) {
      // Codec config (SPS/PPS): a new encoding session, e.g. after rotation.
      this.config = payload.slice();
      const codec = avcCodecString(payload);
      if (codec && codec !== this.codec) this.configure(codec);
      this.needKey = true;
      return;
    }
    const isKey = (flags & 2) !== 0;
    if (!this.decoder || this.decoder.state !== "configured") return;
    if (this.needKey && !isKey) return;
    // Annex B decoding needs SPS/PPS in-band ahead of each key frame.
    const data = isKey && this.config ? concat(this.config, payload) : payload;
    this.needKey = false;
    try {
      this.decoder.decode(
        new EncodedVideoChunk({ type: isKey ? "key" : "delta", timestamp: (this.pts += 16_667), data }),
      );
    } catch {
      this.recover();
    }
  }

  private configure(codec: string) {
    this.resetDecoder();
    const decoder = new VideoDecoder({
      output: (frame) => {
        this.pending?.close();
        this.pending = frame;
        if (!this.raf) this.raf = requestAnimationFrame(() => this.paint());
      },
      error: () => this.recover(),
    });
    try {
      decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: "prefer-hardware" });
    } catch {
      this.switchToPolling();
      return;
    }
    this.decoder = decoder;
    this.codec = codec;
  }

  /** A decoder error drops to waiting for a fresh config and key frame. */
  private recover() {
    this.resetDecoder();
    this.sendJson({ type: "reset" });
  }

  private paint() {
    this.raf = 0;
    const frame = this.pending;
    if (!frame || !this.ctx) return;
    this.pending = null;
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.drawImage(frame, 0, 0);
    frame.close();
    this.videoSize = { width, height };
    this.markFrame(width, height);
  }

  private markFrame(width: number, height: number) {
    const first = !this.hasFrame;
    this.hasFrame = true;
    this.frameCount += 1;
    if (this.status !== "live") this.setStatus("live");
    this.hooks.onFrame?.(width, height, first);
  }

  private async poll() {
    if (!this.wanted || this.mode !== "poll") return;
    this.pollInFlight = true;
    if (!this.hasFrame) this.setStatus("connecting");
    try {
      const response = await fetch(screenshotUrl("android", this.avd), { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const bitmap = await createImageBitmap(await response.blob());
      if (this.ctx) {
        if (this.canvas.width !== bitmap.width || this.canvas.height !== bitmap.height) {
          this.canvas.width = bitmap.width;
          this.canvas.height = bitmap.height;
        }
        this.ctx.drawImage(bitmap, 0, 0);
      }
      this.pollFailures = 0;
      this.markFrame(bitmap.width, bitmap.height);
      bitmap.close();
    } catch {
      this.pollFailures += 1;
      this.setStatus(this.hasFrame ? "reconnecting" : this.pollFailures >= 3 ? "unavailable" : "connecting");
    } finally {
      this.pollInFlight = false;
      if (this.wanted) {
        const backoff = Math.min(15000, this.pollIntervalMs * 2 ** Math.min(this.pollFailures, 4));
        this.timer = window.setTimeout(() => {
          this.timer = 0;
          void this.poll();
        }, this.pollFailures ? backoff : this.pollIntervalMs);
      }
    }
  }

  private startFpsMeter() {
    this.stopFpsMeter();
    this.fpsTimer = window.setInterval(() => {
      this.hooks.onStats?.(this.frameCount);
      this.frameCount = 0;
    }, 1000);
  }

  private stopFpsMeter() {
    clearInterval(this.fpsTimer);
    this.fpsTimer = 0;
  }
}
