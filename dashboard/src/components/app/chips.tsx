import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { AsteriskIcon, ChevronRightIcon, SmartphoneIcon, TabletSmartphoneIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { kindLabel, laneHealth, viaLabel, type Device, type SlimLevel } from "@/lib/devices";
import type { DeviceAgent, Lane, Platform } from "@/lib/types";

/** State dot with a text twin for screen readers; colour is never the only cue. */
export function StateDot({ device, className }: { device: Device; className?: string }) {
  const tone = device.live ? "bg-live" : device.transitioning ? "bg-caution" : "bg-muted-foreground/40";
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", tone, device.live && "pulse-live", className)}
      aria-hidden
    />
  );
}

export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = platform === "ios" ? SmartphoneIcon : TabletSmartphoneIcon;
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center",
        platform === "ios" ? "text-ios" : "text-android",
        className,
      )}
      title={platform === "ios" ? "iOS simulator" : "Android emulator"}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{platform === "ios" ? "iOS" : "Android"}</span>
    </span>
  );
}

const CHIP = "inline-flex h-5 max-w-full items-center gap-1 rounded-sm px-1.5 text-[11px] leading-none font-medium whitespace-nowrap";

export function Chip({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "live" | "caution" | "danger" | "primary" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    live: "bg-live/12 text-live",
    caution: "bg-caution/14 text-caution",
    danger: "bg-destructive/10 text-destructive",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <span className={cn(CHIP, tones[tone], className)} {...props}>
      {children}
    </span>
  );
}

const SLIM_TONE: Record<SlimLevel, "live" | "caution" | "neutral"> = {
  verified: "live",
  tuned: "live",
  partial: "caution",
  stock: "caution",
  unknown: "neutral",
};

export function SlimChip({ device }: { device: Device }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Chip tone={SLIM_TONE[device.slim.level]} tabIndex={0} aria-label={`${device.slim.label}: ${device.slim.detail}`}>
          {device.slim.label}
        </Chip>
      </TooltipTrigger>
      <TooltipContent>{device.slim.detail}</TooltipContent>
    </Tooltip>
  );
}

export function LaneChip({ lane, compact = false }: { lane: Lane; compact?: boolean }) {
  const health = laneHealth(lane);
  const endpoint = lane.mode === "release" ? "embedded" : `:${lane.port}`;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Chip tone={health.tone} className="tabular">
        {endpoint} {health.label}
      </Chip>
      {!compact ? (
        <span className="truncate font-mono text-[11px] text-muted-foreground" title={lane.worktreePath}>
          {lane.branch}
        </span>
      ) : null}
      {!compact ? <Chip>{`${lane.environment}/${lane.mode}`}</Chip> : null}
    </span>
  );
}

export function AgentGlyph({ kind, className }: { kind: DeviceAgent["kind"]; className?: string }) {
  const Icon = kind === "claude" ? AsteriskIcon : ChevronRightIcon;
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] text-background",
        kind === "claude" ? "bg-claude" : "bg-codex",
        className,
      )}
      aria-hidden
    >
      <Icon className="size-3" strokeWidth={2.5} />
    </span>
  );
}

/**
 * The attachment strip: which agent holds this device and how. This is the
 * headline of the dashboard, so it gets the only saturated colour on a tile.
 */
export function AgentStrip({ agents, dense = false }: { agents: DeviceAgent[]; dense?: boolean }) {
  if (agents.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1", dense && "gap-0.5")} aria-label="Attached agent sessions">
      {agents.map((agent) => (
        <li
          key={`${agent.kind}:${agent.sessionId}`}
          className={cn(
            "flex min-w-0 items-center gap-1.5 border-l-2 pl-1.5",
            agent.kind === "claude" ? "border-claude" : "border-codex",
          )}
        >
          <AgentGlyph kind={agent.kind} />
          <span className="min-w-0 flex-1 truncate text-xs" title={`${kindLabel(agent.kind)} · ${agent.title}`}>
            <span className="sr-only">{kindLabel(agent.kind)} session </span>
            {agent.title}
          </span>
          {!dense ? <span className="shrink-0 text-[11px] text-muted-foreground">{viaLabel(agent.via)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function AgentBadge({ kind, children }: { kind: DeviceAgent["kind"]; children?: ReactNode }) {
  return (
    <span
      className={cn(
        CHIP,
        kind === "claude" ? "bg-claude/14 text-claude" : "bg-codex/14 text-codex",
      )}
    >
      {kind === "claude" ? <AsteriskIcon className="size-3" strokeWidth={2.5} aria-hidden /> : <ChevronRightIcon className="size-3" strokeWidth={2.5} aria-hidden />}
      {children ?? kindLabel(kind)}
    </span>
  );
}
