import { useMemo } from "react";
import { cn } from "cn";
import { BotOffIcon } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { kindLabel, viaLabel, type Device } from "@/lib/devices";
import { shortPath, timeAgo } from "@/lib/format";
import { fleet } from "@/lib/fleet-store";
import type { AgentKind, AgentSession, AttachmentVia } from "@/lib/types";
import { navigate } from "@/lib/ui-store";
import { AgentBadge, PlatformGlyph, StateDot } from "./chips";
import { EmptyState } from "./device-wall";
import { Skeleton } from "@/components/ui/skeleton";

type Row = AgentSession & {
  live: boolean;
  devices: Array<{ device: Device; via: AttachmentVia }>;
};

export function AgentsView() {
  const status = fleet.use((state) => state.status);
  const devices = fleet.use((state) => state.devices);
  const settled = fleet.use((state) => state.settled);
  const now = useNow();

  const rows = useMemo<Row[]>(() => {
    if (!status) return [];
    const byKey = new Map<string, Row>();
    for (const session of status.agentSessions) {
      byKey.set(`${session.kind}:${session.sessionId}`, { ...session, live: true, devices: [] });
    }
    // Claims can outlive the session registry (Codex claims, exited sessions); keep them visible.
    for (const device of devices) {
      for (const agent of device.agents) {
        const key = `${agent.kind}:${agent.sessionId}`;
        let row = byKey.get(key);
        if (!row) {
          row = { ...agent, live: false, devices: [] };
          byKey.set(key, row);
        }
        row.devices.push({ device, via: agent.via });
      }
    }
    return [...byKey.values()].sort(
      (a, b) =>
        Number(b.live) - Number(a.live) ||
        b.devices.length - a.devices.length ||
        Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "") ||
        a.title.localeCompare(b.title),
    );
  }, [status, devices]);

  if (!settled) {
    return (
      <div className="space-y-2" aria-busy aria-label="Loading agents">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BotOffIcon className="size-6" strokeWidth={1.5} aria-hidden />}
        title="No agent sessions"
        body="Live Claude Code sessions and Codex threads active in the last 30 minutes show up here, along with the devices they hold."
      />
    );
  }

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.kind] += 1;
      return acc;
    },
    { claude: 0, codex: 0 } as Record<AgentKind, number>,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold tracking-tight">Agent sessions</h1>
        <p className="tabular text-xs text-muted-foreground">
          {counts.claude} Claude · {counts.codex} Codex
        </p>
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--edge)]">
        <table className="w-full text-sm">
          <caption className="sr-only">Live agent sessions and the devices attached to each</caption>
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Session</th>
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Working directory</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Last activity</th>
              <th scope="col" className="px-3 py-2 font-medium">Devices</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.kind}:${row.sessionId}`} className="border-t align-top">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AgentBadge kind={row.kind} />
                    <span className="min-w-0 truncate font-medium" title={row.title}>
                      {row.title}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground md:hidden">{row.cwd ? shortPath(row.cwd) : "—"}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground" title={row.sessionId}>
                    {row.sessionId.slice(0, 8)}
                    {row.pid ? ` · pid ${row.pid}` : ""}
                  </div>
                </td>
                <td className="hidden max-w-0 truncate px-3 py-2.5 font-mono text-xs text-muted-foreground md:table-cell" title={row.cwd}>
                  {row.cwd ? shortPath(row.cwd) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      row.live ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", row.live ? "bg-live" : "bg-muted-foreground/40")} aria-hidden />
                    {row.live ? (row.status ?? "running") : "not running"}
                  </span>
                </td>
                <td className="tabular hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                  {timeAgo(row.updatedAt, now)}
                </td>
                <td className="px-3 py-2.5">
                  {row.devices.length === 0 ? (
                    <span className="text-xs text-muted-foreground">none</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1">
                      {row.devices.map(({ device, via }) => (
                        <li key={device.id}>
                          <button
                            type="button"
                            className="press inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-1.5 text-xs hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
                            onClick={() => navigate({ view: "devices", focusedId: device.id })}
                            aria-label={`Open ${device.name}, ${viaLabel(via)}`}
                          >
                            <PlatformGlyph platform={device.platform} />
                            <StateDot device={device} />
                            <span className="max-w-40 truncate">{device.name}</span>
                            <span className="text-muted-foreground">{viaLabel(via)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Attachment comes from an explicit claim, a recent request carrying the session headers (recently active), or a lane whose worktree is the session's working directory.
        {" "}{kindLabel("codex")} sessions are detected by recency only.
      </p>
    </div>
  );
}
