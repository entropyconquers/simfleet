import { useMemo } from "react";
import { cn } from "cn";
import { KeyboardIcon, MonitorIcon, MoonIcon, PlusIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bytes } from "@/lib/format";
import { fleet } from "@/lib/fleet-store";
import { cycleTheme, theme } from "@/lib/theme";
import { navigate, ui, type View } from "@/lib/ui-store";

const VIEWS: Array<{ id: View; label: string; key: string }> = [
  { id: "devices", label: "Devices", key: "1" },
  { id: "agents", label: "Agents", key: "2" },
  { id: "host", label: "Host", key: "3" },
];

export function CommandBar() {
  const status = fleet.use((state) => state.status);
  const devices = fleet.use((state) => state.devices);
  const view = ui.use((state) => state.view);
  const focusedId = ui.use((state) => state.focusedId);
  const preference = theme.use((state) => state.preference);

  const vitals = useMemo(() => {
    if (!status) return null;
    const used = status.memory.totalBytes * (1 - status.memory.freePercent / 100);
    const swapPct = status.memory.swapTotalBytes ? (status.memory.swapUsedBytes / status.memory.swapTotalBytes) * 100 : 0;
    const booted = devices.filter((device) => device.live).length;
    const attached = new Set(devices.flatMap((device) => device.agents.map((agent) => `${agent.kind}:${agent.sessionId}`))).size;
    return {
      memory: `${bytes(used)} of ${bytes(status.memory.totalBytes)}`,
      memoryPct: 100 - status.memory.freePercent,
      swap: bytes(status.memory.swapUsedBytes),
      swapPct,
      booted,
      total: devices.length,
      agents: status.agentSessions.length,
      attached,
      metro: status.metroListeners.length,
    };
  }, [status, devices]);

  const ThemeIcon = preference === "system" ? SunMoonIcon : preference === "light" ? SunIcon : MoonIcon;

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b bg-card/80 px-3 backdrop-blur supports-backdrop-filter:bg-card/70 sm:px-4">
      <a href="#" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60" onClick={(event) => { event.preventDefault(); navigate({ view: "devices", focusedId: null }); }}>
        <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground" aria-hidden>
          <MonitorIcon className="size-3.5" strokeWidth={2.25} />
        </span>
        <span className="text-sm font-semibold tracking-tight">simfleet</span>
        {status ? <span className="hidden text-sm text-muted-foreground sm:inline">{status.projectName}</span> : null}
      </a>

      <nav aria-label="Views" className="ml-1 hidden items-center gap-0.5 md:flex">
        {VIEWS.map((item) => {
          const current = view === item.id && !focusedId;
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              aria-current={current ? "page" : undefined}
              className={cn("press h-7 px-2.5", current && "bg-muted text-foreground")}
              onClick={() => navigate({ view: item.id, focusedId: null })}
            >
              {item.label}
            </Button>
          );
        })}
      </nav>

      {vitals ? (
        <dl className="ml-auto hidden items-center gap-4 text-xs text-muted-foreground lg:flex" aria-label="Host vitals">
          <Vital label="Memory" value={vitals.memory} meter={vitals.memoryPct} warn={vitals.memoryPct > 85} />
          <Vital label="Swap" value={vitals.swap} meter={vitals.swapPct} warn={vitals.swapPct > 60} />
          <Vital label="Booted" value={`${vitals.booted} / ${vitals.total}`} />
          <Vital label="Agents" value={`${vitals.agents} live · ${vitals.attached} attached`} />
        </dl>
      ) : (
        <div className="ml-auto" />
      )}

      <div className="flex items-center gap-1">
        <Button size="sm" className="press h-7" onClick={() => ui.set({ laneDialog: { open: true } })}>
          <PlusIcon data-icon="inline-start" />
          Start lane
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="press" onClick={() => cycleTheme()} aria-label={`Theme: ${preference}. Switch theme`}>
              <ThemeIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Theme: {preference} <Kbd>t</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="press" onClick={() => ui.set({ helpOpen: true })} aria-label="Keyboard shortcuts" aria-haspopup="dialog">
              <KeyboardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Shortcuts <Kbd>?</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function Vital({ label, value, meter, warn }: { label: string; value: string; meter?: number; warn?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground/80">{label}</dt>
      <dd className={cn("tabular flex items-center gap-1.5 font-medium text-foreground", warn && "text-caution")}>
        {meter !== undefined ? (
          <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn("absolute inset-y-0 left-0 rounded-full", warn ? "bg-caution" : "bg-primary/70")} style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
          </span>
        ) : null}
        {value}
      </dd>
    </div>
  );
}
