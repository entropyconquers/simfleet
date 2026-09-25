import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { matchesFilters } from "@/lib/devices";
import { fleet } from "@/lib/fleet-store";
import type { StreamStatus } from "@/lib/ios-stream";
import { navigate, ui } from "@/lib/ui-store";
import { DeviceScreen, type ScreenHandle } from "./device-screen";
import { Inspector } from "./inspector";
import { PlatformGlyph, StateDot } from "./chips";
import { EmptyState } from "./device-wall";
import { MonitorOffIcon } from "lucide-react";

export function FocusView({ deviceId }: { deviceId: string }) {
  const devices = fleet.use((state) => state.devices);
  const status = fleet.use((state) => state.status);
  const settled = fleet.use((state) => state.settled);
  const platform = ui.use((state) => state.platform);
  const stateFilter = ui.use((state) => state.state);
  const query = ui.use((state) => state.query);
  const hidden = ui.use((state) => state.hidden);
  const screenRef = useRef<ScreenHandle>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [fps, setFps] = useState(0);

  const device = devices.find((candidate) => candidate.id === deviceId) ?? null;
  // Prev/next walk the wall in its current filtered order.
  const order = useMemo(
    () => devices.filter((candidate) => matchesFilters(candidate, platform, stateFilter, query)).map((candidate) => candidate.id),
    [devices, platform, stateFilter, query],
  );
  const index = order.indexOf(deviceId);
  const step = (delta: number) => {
    if (order.length === 0) return;
    const base = index < 0 ? 0 : index;
    navigate({ focusedId: order[(base + delta + order.length) % order.length] });
  };

  useEffect(() => {
    backRef.current?.focus();
  }, [deviceId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [data-controlling]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!device) {
    if (!settled) return null;
    return (
      <EmptyState
        icon={<MonitorOffIcon className="size-6" strokeWidth={1.5} aria-hidden />}
        title="Device not found"
        body={`No simulator or emulator with the id ${deviceId} is known to this fleet.`}
        action={
          <Button variant="outline" size="sm" className="press" onClick={() => navigate({ focusedId: null })}>
            Back to devices
          </Button>
        }
      />
    );
  }

  const serviceUp = status?.simulatorControl.running ?? true;
  const streamLabel = !device.live
    ? device.state
    : device.platform === "ios"
      ? !serviceUp
        ? "Video service off"
        : streamStatus === "live"
          ? `${fps} fps`
          : streamStatus
      : streamStatus === "live"
        ? "Polling screenshots"
        : streamStatus;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={backRef} variant="ghost" size="sm" className="press -ml-2" onClick={() => navigate({ focusedId: null })}>
          <ArrowLeftIcon data-icon="inline-start" />
          All devices
          <Kbd className="ml-1">Esc</Kbd>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <PlatformGlyph platform={device.platform} />
          <h1 className="truncate text-base font-semibold tracking-tight">{device.name}</h1>
          <StateDot device={device} />
          <span className="text-sm text-muted-foreground">
            {device.state} · {device.subtitle}
          </span>
          <span className="tabular hidden text-xs text-muted-foreground sm:inline" aria-live="off">
            {streamLabel}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="tabular text-xs text-muted-foreground">
            {index >= 0 ? `${index + 1} of ${order.length}` : ""}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="press" aria-label="Previous device" onClick={() => step(-1)} disabled={order.length < 2}>
                <ChevronLeftIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Previous <Kbd>←</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="press" aria-label="Next device" onClick={() => step(1)} disabled={order.length < 2}>
                <ChevronRightIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Next <Kbd>→</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section aria-label="Live screen" className="flex min-h-[420px] min-w-0 flex-1 flex-col lg:min-h-0">
          <DeviceScreen
            key={device.id}
            ref={screenRef}
            device={device}
            mode="stage"
            active={!hidden}
            serviceUp={serviceUp}
            interactive
            onStatus={setStreamStatus}
            onStats={setFps}
            className={cn("h-full w-full flex-1 rounded-xl")}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Click to tap, drag to swipe. Press <Kbd>Enter</Kbd> on the screen to type into the device; <Kbd>Esc</Kbd> releases.
          </p>
        </section>
        <Inspector device={device} screen={screenRef} status={status} />
      </div>
    </div>
  );
}
