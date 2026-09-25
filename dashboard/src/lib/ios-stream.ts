import { streamUrl } from "./api";

export type StreamStatus = "idle" | "connecting" | "reconnecting" | "live" | "paused" | "unavailable";

export type StreamQuality = { fps: number; maxWidth: number };

type Hooks = {
  onStatus?: (status: StreamStatus) => void;
  onFrame?: (width: number, height: number, first: boolean) => void;
  onText?: (text: string) => void;
  onStats?: (fps: number) => void;
};

/** Reads JPEG dimensions from the SOF marker without decoding. */
function jpegSize(buffer: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * One MJPEG WebSocket per visible iOS tile. The last frame stays on the canvas
 * while reconnecting; reconnects back off exponentially up to 15 s.
 */
export class IosStream {
  private ws: WebSocket | null = null;
  private wanted = false;
  private attempt = 0;
  private timer = 0;
  private queued: ArrayBuffer | null = null;
  private busy = false;
  private pending: ImageBitmap | null = null;
  private raf = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private frameSize = { width: 0, height: 0 };
  private quality: StreamQuality = { fps: 8, maxWidth: 0 };
  private ctx: CanvasRenderingContext2D | null;
  status: StreamStatus = "idle";
  hasFrame = false;
  fps = 0;

  constructor(
    readonly udid: string,
    readonly canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext("2d");
  }

  start() {
    this.wanted = true;
    if (!this.ws) this.open();
  }

  stop(reason: StreamStatus = "paused") {
    this.wanted = false;
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
    this.stopFpsMeter();
    this.setStatus(this.hasFrame ? reason : "idle");
  }

  destroy() {
    this.stop("idle");
    if (this.raf) cancelAnimationFrame(this.raf);
    this.pending?.close();
    this.pending = null;
  }

  retryNow() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.attempt = 0;
    if (this.wanted && !this.ws) this.open();
  }

  private open() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(streamUrl(this.udid));
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.setStatus(this.hasFrame ? "reconnecting" : "connecting");
    ws.onopen = () => {
      this.attempt = 0;
      this.send({ type: "set_fps", fps: this.quality.fps });
      this.send({ type: "snapshot" });
      this.startFpsMeter();
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) this.enqueue(event.data);
      else this.hooks.onText?.(String(event.data));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopFpsMeter();
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows.
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(15000, 700 * 2 ** this.attempt) + Math.random() * 400;
    this.attempt = Math.min(this.attempt + 1, 6);
    this.setStatus(this.hasFrame ? "reconnecting" : this.attempt >= 4 ? "unavailable" : "connecting");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.wanted && !this.ws) this.open();
    }, delay);
  }

  private setStatus(status: StreamStatus) {
    if (this.status === status) return;
    this.status = status;
    this.hooks.onStatus?.(status);
  }

  send(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  setQuality(next: StreamQuality) {
    const changed = next.fps !== this.quality.fps;
    const sharper = next.maxWidth === 0 || next.maxWidth > this.quality.maxWidth;
    this.quality = next;
    if (changed) this.send({ type: "set_fps", fps: next.fps });
    if (sharper && this.hasFrame) this.send({ type: "snapshot" });
  }

  refresh() {
    this.send({ type: "snapshot" });
  }

  private enqueue(buffer: ArrayBuffer) {
    this.queued = buffer; // Latest wins; a backlog would only add latency.
    this.pump();
  }

  private pump() {
    if (this.busy || !this.queued) return;
    const buffer = this.queued;
    this.queued = null;
    this.busy = true;
    const size = jpegSize(buffer);
    const blob = new Blob([buffer], { type: "image/jpeg" });
    const options: ImageBitmapOptions = {};
    if (size && this.quality.maxWidth && size.width > this.quality.maxWidth) {
      options.resizeWidth = this.quality.maxWidth;
      options.resizeQuality = "medium";
    }
    const decode = Object.keys(options).length
      ? createImageBitmap(blob, options).catch(() => createImageBitmap(blob))
      : createImageBitmap(blob);
    decode
      .then((bitmap) => {
        this.pending?.close();
        this.pending = bitmap;
        if (size) this.frameSize = size;
        if (!this.raf) this.raf = requestAnimationFrame(() => this.paint());
      })
      .catch(() => {
        // Corrupt frame; keep the previous one.
      })
      .finally(() => {
        this.busy = false;
        this.pump();
      });
  }

  private paint() {
    this.raf = 0;
    const frame = this.pending;
    if (!frame || !this.ctx) return;
    this.pending = null;
    if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) {
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }
    this.ctx.drawImage(frame, 0, 0);
    frame.close();
    const first = !this.hasFrame;
    this.hasFrame = true;
    this.frameCount += 1;
    if (this.status !== "live") this.setStatus("live");
    this.hooks.onFrame?.(this.frameSize.width || frame.width, this.frameSize.height || frame.height, first);
  }

  private startFpsMeter() {
    this.stopFpsMeter();
    this.fpsTimer = window.setInterval(() => {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.hooks.onStats?.(this.fps);
    }, 1000);
  }

  private stopFpsMeter() {
    clearInterval(this.fpsTimer);
    this.fpsTimer = 0;
    this.fps = 0;
  }
}
