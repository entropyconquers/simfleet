import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Loader2Icon, PowerIcon, RefreshCwIcon, VideoOffIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AndroidPoller } from "@/lib/android-poller";
import type { Device } from "@/lib/devices";
import { IosStream, type StreamStatus } from "@/lib/ios-stream";

export type ScreenHandle = {
  saveFrame: () => void;
  refresh: () => void;
  focus: () => void;
};

type Props = {
  device: Device;
  mode: "tile" | "stage";
  /** Streams run only while active: visible, booted, tab shown, service up. */
  active: boolean;
  serviceUp: boolean;
  /** Pointer and keyboard input goes to the device (stage mode). */
  interactive?: boolean;
  onActivate?: () => void;
  onStatus?: (status: StreamStatus) => void;
  onStats?: (fps: number) => void;
  className?: string;
};

type Fit = { width: number; height: number; left: number; top: number };

const PRINTABLE = /^[\x20-\x7e]$/;
const KEY_CODES = new Set([
  "Enter",
  "NumpadEnter",
  "Backspace",
  "Delete",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function containedRect(box: { width: number; height: number }, frame: { width: number; height: number }): Fit {
  if (!frame.width || !frame.height || !box.width || !box.height) {
    return { width: box.width, height: box.height, left: 0, top: 0 };
  }
  const scale = Math.min(box.width / frame.width, box.height / frame.height);
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  return { width, height, left: Math.round((box.width - width) / 2), top: Math.round((box.height - height) / 2) };
}

function defaultFrame(device: Device): { width: number; height: number } {
  if (/ipad/i.test(device.name)) return { width: 3, height: 4 };
  if (device.platform === "android") return { width: 9, height: 20 };
  return { width: 9, height: 19.5 };
}

export const DeviceScreen = forwardRef<ScreenHandle, Props>(function DeviceScreen(
  { device, mode, active, serviceUp, interactive = false, onActivate, onStatus, onStats, className },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const engineRef = useRef<IosStream | AndroidPoller | null>(null);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [hasFrame, setHasFrame] = useState(false);
  const [frame, setFrame] = useState(() => defaultFrame(device));
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [controlling, setControlling] = useState(false);
  const pointer = useRef<{ x: number; y: number; at: number; id: number } | null>(null);
  const wheelAt = useRef(0);
  const hooks = useRef({ onStatus, onStats });
  hooks.current = { onStatus, onStats };

  const live = device.live;
  const isIos = device.platform === "ios";
  const fit = useMemo(() => containedRect(box, frame), [box, frame]);
  const clip = Math.max(4, Math.round(fit.width * (mode === "stage" ? 0.05 : 0.04)));

  // Measure the box so the frame can be fitted exactly (this keeps input mapping 1:1).
  useLayoutEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // One engine per mounted screen. Unmounting (filtered out, other view) tears it down.
  useEffect(() => {
    const engine: IosStream | AndroidPoller = isIos
      ? new IosStream(device.id, canvasRef.current!, {
          onStatus: (next) => {
            setStatus(next);
            hooks.current.onStatus?.(next);
          },
          onFrame: (width, height, first) => {
            setFrame((current) => (current.width === width && current.height === height ? current : { width, height }));
            if (first) setHasFrame(true);
          },
          onStats: (fps) => hooks.current.onStats?.(fps),
          onText: (text) => {
            try {
              const data = JSON.parse(text) as { ok?: boolean; error?: string };
              if (data.ok === false && data.error) toast.error(`${device.name}: ${data.error}`);
            } catch {
              // Not JSON; ignore.
            }
          },
        })
      : new AndroidPoller(device.id, imageRef.current!, {
          onStatus: (next) => {
            setStatus(next);
            hooks.current.onStatus?.(next);
          },
          onFrame: (width, height, first) => {
            setFrame((current) => (current.width === width && current.height === height ? current : { width, height }));
            if (first) setHasFrame(true);
          },
        });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // The device identity is stable per mounted tile; name changes do not need a new engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, isIos]);

  // Start or pause based on visibility, state and the tab.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const should = active && live && (isIos ? serviceUp : true);
    let timer = 0;
    if (should) {
      engine.start();
      if (engine instanceof IosStream) {
        const cssWidth = fit.width || 240;
        const px = Math.ceil(cssWidth * (window.devicePixelRatio || 1) * 1.25);
        engine.setQuality(mode === "stage" ? { fps: 30, maxWidth: 0 } : { fps: cssWidth >= 320 ? 8 : 5, maxWidth: px });
      } else {
        engine.setInterval(mode === "stage" ? 1500 : 2000);
      }
    } else {
      // Debounce so fast scrolling does not churn sockets.
      timer = window.setTimeout(() => engine.stop("paused"), 1200);
    }
    return () => clearTimeout(timer);
  }, [active, live, serviceUp, isIos, mode, fit.width]);

  // A device that shuts down loses its frame; the next boot shows a fresh one.
  useEffect(() => {
    if (!live) {
      setHasFrame(false);
      setFrame(defaultFrame(device));
      setControlling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => boxRef.current?.focus(),
      refresh: () => engineRef.current?.refresh(),
      saveFrame: () => {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `${device.name}-${stamp}.png`.replace(/\s+/g, "-");
        const download = (href: string) => {
          const anchor = document.createElement("a");
          anchor.href = href;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        };
        if (isIos) {
          const canvas = canvasRef.current;
          if (!canvas || !hasFrame) {
            toast.error("No frame to save yet");
            return;
          }
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            download(url);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          }, "image/png");
        } else {
          const image = imageRef.current;
          if (!image?.src || !hasFrame) {
            toast.error("No frame to save yet");
            return;
          }
          download(image.src);
        }
        toast.success("Screenshot saved");
      },
    }),
    [device.name, hasFrame, isIos],
  );

  const send = useCallback(
    (payload: Record<string, unknown>) => {
      api.input(device.platform, device.id, payload).catch((error: Error) => {
        toast.error(`${device.name}: ${error.message}`);
      });
    },
    [device.id, device.name, device.platform],
  );

  const toFrame = (event: { clientX: number; clientY: number }) => {
    const target = (isIos ? canvasRef.current : imageRef.current) as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    return {
      x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
      width: rect.width,
      height: rect.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !live || !hasFrame || event.button !== 0) return;
    const point = toFrame(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: point.x, y: point.y, at: performance.now(), id: event.pointerId };
    boxRef.current?.focus();
    setControlling(true);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || start.id !== event.pointerId) return;
    const end = toFrame(event);
    if (!end) return;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const held = performance.now() - start.at;
    if (distance < 8) {
      if (device.platform === "android" && held > 600) {
        send({ kind: "long-press", x: start.x, y: start.y, width: end.width, height: end.height });
      } else {
        send({ kind: "tap", x: start.x, y: start.y, width: end.width, height: end.height });
      }
      return;
    }
    send({
      kind: "swipe",
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      width: end.width,
      height: end.height,
      durationSeconds: Math.min(1, Math.max(0.1, held / 1000)),
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!interactive || !live || !hasFrame || !controlling) return;
    const now = performance.now();
    if (now - wheelAt.current < 220) return;
    wheelAt.current = now;
    const point = toFrame(event);
    if (!point) return;
    const length = Math.min(point.height * 0.35, Math.max(40, Math.abs(event.deltaY) * 2));
    const direction = event.deltaY > 0 ? -1 : 1;
    send({
      kind: "swipe",
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: Math.min(point.height, Math.max(0, point.y + direction * length)),
      width: point.width,
      height: point.height,
      durationSeconds: 0.15,
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive) {
      if ((event.key === "Enter" || event.key === " ") && onActivate) {
        event.preventDefault();
        onActivate();
      }
      return;
    }
    if (event.key === "Escape") {
      if (controlling) {
        event.preventDefault();
        event.stopPropagation();
        setControlling(false);
      }
      return;
    }
    if (!controlling) {
      if (event.key === "Enter" && live) {
        event.preventDefault();
        setControlling(true);
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Tab") return; // Keep the page navigable.
    if (KEY_CODES.has(event.code)) {
      event.preventDefault();
      send({ kind: "key", code: event.code });
    } else if (PRINTABLE.test(event.key)) {
      event.preventDefault();
      send({ kind: "text", text: event.key });
    }
  };

  const label = (() => {
    const base = `${device.name}, ${device.platform === "ios" ? "iOS" : "Android"}`;
    if (!live) return `${base}, ${device.state.toLowerCase()}`;
    if (!interactive) return `Live screen of ${base}. Press Enter to open.`;
    return controlling
      ? `Controlling ${base}. Keys and clicks go to the device. Press Escape to release.`
      : `Live screen of ${base}. Click or press Enter to take control.`;
  })();

  const overlay = (() => {
    if (device.transitioning) {
      const action = device.operation?.action;
      const text = action
        ? { boot: "Booting", slim: "Slimming", restore: "Restoring", shutdown: "Shutting down", open: "Opening", tune: "Tuning" }[action] ?? action
        : device.state;
      return { icon: <Loader2Icon className="size-4 animate-spin" aria-hidden />, text: `${text}…` };
    }
    if (!live) return { icon: <PowerIcon className="size-4" aria-hidden />, text: device.state };
    if (isIos && !serviceUp) return { icon: <VideoOffIcon className="size-4" aria-hidden />, text: "Video service off" };
    if (hasFrame) return null;
    if (status === "unavailable") return { icon: <VideoOffIcon className="size-4" aria-hidden />, text: "No video yet", retry: true };
    if (!active) return { icon: null, text: "Paused" };
    return { icon: <Loader2Icon className="size-4 animate-spin" aria-hidden />, text: "Connecting" };
  })();

  const badge =
    hasFrame && live
      ? status === "reconnecting"
        ? "Reconnecting"
        : status === "paused" || (!active && status !== "live")
          ? "Paused"
          : null
      : null;

  return (
    <div
      ref={boxRef}
      role={interactive ? "group" : "img"}
      aria-label={label}
      aria-busy={live && !hasFrame && !overlay?.retry ? true : undefined}
      tabIndex={0}
      data-controlling={controlling || undefined}
      className={cn(
        "relative isolate overflow-hidden outline-none select-none",
        mode === "stage" ? "bg-muted/50" : "bg-screen",
        "focus-visible:ring-3 focus-visible:ring-ring/60",
        interactive && live && "cursor-crosshair",
        !interactive && onActivate && "cursor-pointer",
        controlling && "ring-2 ring-primary ring-inset",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (pointer.current = null)}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onBlur={() => setControlling(false)}
      onClick={!interactive && onActivate ? onActivate : undefined}
    >
      {isIos ? (
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn("absolute screen-edge transition-opacity duration-300", hasFrame ? "opacity-100" : "opacity-0")}
          style={{ width: fit.width, height: fit.height, left: fit.left, top: fit.top, borderRadius: clip }}
        />
      ) : (
        <img
          ref={imageRef}
          alt=""
          draggable={false}
          className={cn("absolute screen-edge transition-opacity duration-300", hasFrame ? "opacity-100" : "opacity-0")}
          style={{ width: fit.width, height: fit.height, left: fit.left, top: fit.top, borderRadius: clip }}
        />
      )}
      {overlay ? (
        <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs", mode === "stage" ? "text-muted-foreground" : "text-white/70")}>
          <div className="flex items-center gap-1.5">
            {overlay.icon}
            <span>{overlay.text}</span>
          </div>
          {overlay.retry ? (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              className="press"
              onClick={(event) => {
                event.stopPropagation();
                const engine = engineRef.current;
                if (engine instanceof IosStream) engine.retryNow();
                else engine?.refresh();
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {badge ? (
        <span className="absolute top-1.5 right-1.5 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
          {badge}
        </span>
      ) : null}
      {controlling ? (
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm bg-black/65 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white/90">
          Keys go to device · Esc releases
        </span>
      ) : null}
    </div>
  );
});
