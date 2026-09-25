import { screenshotUrl } from "./api";
import type { StreamStatus } from "./ios-stream";

type Hooks = {
  onStatus?: (status: StreamStatus) => void;
  onFrame?: (width: number, height: number, first: boolean) => void;
};

/**
 * Android has no video stream: visible booted tiles poll a PNG screenshot,
 * one request in flight per tile, keeping the last frame across failures.
 */
export class AndroidPoller {
  private wanted = false;
  private timer = 0;
  private inFlight = false;
  private failures = 0;
  private objectUrl: string | null = null;
  private intervalMs = 1750;
  status: StreamStatus = "idle";
  hasFrame = false;

  constructor(
    readonly avd: string,
    readonly image: HTMLImageElement,
    private hooks: Hooks,
  ) {}

  start() {
    this.wanted = true;
    if (!this.timer && !this.inFlight) void this.tick();
  }

  setInterval(ms: number) {
    this.intervalMs = ms;
  }

  stop(reason: StreamStatus = "paused") {
    this.wanted = false;
    clearTimeout(this.timer);
    this.timer = 0;
    this.setStatus(this.hasFrame ? reason : "idle");
  }

  destroy() {
    this.stop("idle");
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  refresh() {
    if (this.wanted && !this.inFlight) {
      clearTimeout(this.timer);
      this.timer = 0;
      void this.tick();
    }
  }

  private setStatus(status: StreamStatus) {
    if (this.status === status) return;
    this.status = status;
    this.hooks.onStatus?.(status);
  }

  private async tick() {
    if (!this.wanted) return;
    this.inFlight = true;
    if (!this.hasFrame) this.setStatus("connecting");
    try {
      const response = await fetch(screenshotUrl("android", this.avd), { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const next = URL.createObjectURL(blob);
      const previous = this.objectUrl;
      this.objectUrl = next;
      this.image.src = next;
      if (previous) URL.revokeObjectURL(previous);
      const first = !this.hasFrame;
      this.hasFrame = true;
      this.failures = 0;
      this.setStatus("live");
      this.hooks.onFrame?.(bitmap.width, bitmap.height, first);
      bitmap.close();
    } catch {
      this.failures += 1;
      this.setStatus(this.hasFrame ? "reconnecting" : this.failures >= 3 ? "unavailable" : "connecting");
    } finally {
      this.inFlight = false;
      if (this.wanted) {
        const backoff = Math.min(15000, this.intervalMs * 2 ** Math.min(this.failures, 4));
        this.timer = window.setTimeout(() => {
          this.timer = 0;
          void this.tick();
        }, this.failures ? backoff : this.intervalMs);
      }
    }
  }
}
