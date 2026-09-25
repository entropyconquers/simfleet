import { memo, useRef, type KeyboardEvent } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVisible } from "@/hooks/use-visible";
import type { Device } from "@/lib/devices";
import { DeviceScreen } from "./device-screen";
import { AgentGlyph, AgentStrip, LaneChip, PlatformGlyph, SlimChip, StateDot } from "./chips";

type Props = {
  device: Device;
  serviceUp: boolean;
  hidden: boolean;
  onOpen: (id: string) => void;
};

export const DeviceTile = memo(function DeviceTile({ device, serviceUp, hidden, onOpen }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const visible = useVisible(ref);
  const open = () => onOpen(device.id);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };
  const summary = [
    device.name,
    device.platform === "ios" ? "iOS" : "Android",
    device.state.toLowerCase(),
    device.lane ? `lane ${device.lane.branch}` : null,
    device.agents.length ? `${device.agents.length} agent${device.agents.length === 1 ? "" : "s"} attached` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li ref={ref} className="@container/tile min-w-0" data-device={device.id}>
      <article
        tabIndex={0}
        aria-label={summary}
        onKeyDown={onKeyDown}
        className={cn(
          "group/card flex h-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground",
          "shadow-[0_0_0_1px_var(--edge),0_1px_2px_oklch(0_0_0/0.04)]",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
          !device.live && "opacity-80",
        )}
      >
        <DeviceScreen
          device={device}
          mode="tile"
          active={visible && !hidden}
          serviceUp={serviceUp}
          onActivate={open}
          className="aspect-[1/2] w-full rounded-t-xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5 @[200px]/tile:gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <PlatformGlyph platform={device.platform} />
            <button
              type="button"
              onClick={open}
              className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline focus-visible:underline focus-visible:outline-none"
              title={device.name}
            >
              {device.name}
            </button>
            <StateDot device={device} />
            <span className="sr-only">{device.state}</span>
          </div>
          <div className="hidden min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground @[200px]/tile:flex">
            <span className="truncate">{device.subtitle}</span>
            <span aria-hidden>·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tabular shrink-0" tabIndex={0} aria-label={`${device.memoryLabel}, ${device.memoryDetail}`}>
                  {device.memoryLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent>{device.memoryDetail}</TooltipContent>
            </Tooltip>
            {device.live ? <SlimChip device={device} /> : null}
          </div>
          {device.lane ? (
            <div className="hidden @[200px]/tile:block">
              <LaneChip lane={device.lane} compact={false} />
            </div>
          ) : null}
          <div className="hidden @[200px]/tile:block">
            <AgentStrip agents={device.agents} />
          </div>
          {/* Compact tiles keep the headline signal: who holds this device. */}
          {device.agents.length ? (
            <div className="flex items-center gap-1 @[200px]/tile:hidden" aria-hidden>
              {device.agents.map((agent) => (
                <AgentGlyph key={`${agent.kind}:${agent.sessionId}`} kind={agent.kind} />
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
});
