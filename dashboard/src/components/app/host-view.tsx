import type { ReactNode } from "react";
import { cn } from "cn";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/lib/actions";
import { bytes, shortPath } from "@/lib/format";
import { fleet } from "@/lib/fleet-store";
import { AVDSLIM_INSTALL } from "@/lib/types";
import { navigate } from "@/lib/ui-store";

export function HostView() {
  const status = fleet.use((state) => state.status);
  const devices = fleet.use((state) => state.devices);

  if (!status) {
    return (
      <div className="grid gap-3 md:grid-cols-2" aria-busy aria-label="Loading host details">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  const memoryUsedPct = 100 - status.memory.freePercent;
  const swapPct = status.memory.swapTotalBytes ? (status.memory.swapUsedBytes / status.memory.swapTotalBytes) * 100 : 0;
  const laneByWorktree = new Map(status.sessions.map((lane) => [lane.worktreePath, lane]));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold tracking-tight">Host</h1>
        <p className="truncate font-mono text-xs text-muted-foreground" title={status.repoRoot}>
          {shortPath(status.repoRoot)}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Memory">
          <Meter label="Used" value={memoryUsedPct} text={`${bytes(status.memory.totalBytes * (memoryUsedPct / 100))} of ${bytes(status.memory.totalBytes)}`} warn={memoryUsedPct > 85} />
          <Meter label="Swap" value={swapPct} text={`${bytes(status.memory.swapUsedBytes)} of ${bytes(status.memory.swapTotalBytes)}`} warn={swapPct > 60} />
          <p className="text-xs text-muted-foreground">
            {devices.filter((device) => device.live).length} devices booted. Slimming a simulator usually saves several hundred megabytes.
          </p>
        </Card>

        <Card title="Toolchain">
          <dl className="space-y-2 text-xs">
            <Tool ok={status.simSlim.installed} name="SimSlim" detail={status.simSlim.installed ? `${status.simSlim.version ?? "installed"}${status.simSlim.stale ? " · inventory stale" : ""}` : "not installed"} />
            {status.simSlim.profilePath ? <Path label="Profile" value={status.simSlim.profilePath} /> : null}
            <Tool
              ok={status.android.avdslim.installed}
              name="avdslim"
              detail={status.android.avdslim.installed ? (status.android.avdslim.version ?? "installed") : "not installed"}
            />
            {!status.android.avdslim.installed ? (
              <div className="flex items-start gap-1.5 rounded-lg bg-caution/10 p-2">
                <code className="min-w-0 flex-1 font-mono text-[11px] leading-snug break-all">{AVDSLIM_INSTALL}</code>
                <Button size="icon-xs" variant="ghost" className="press shrink-0" aria-label="Copy avdslim install command" onClick={() => void copyText(AVDSLIM_INSTALL, "Install command copied")}>
                  <CopyIcon />
                </Button>
              </div>
            ) : null}
            <Tool ok={status.simulatorControl.running} name="Simulator video" detail={status.simulatorControl.running ? `streaming on port ${status.simulatorControl.port}` : status.simulatorControl.available ? "service stopped" : "not available"} />
            <Path label="Android SDK" value={status.android.sdkDirectory ?? "not found"} />
            <Path label="adb" value={status.android.adbPath ?? "not found"} />
            <Path label="emulator" value={status.android.emulatorPath ?? "not found"} />
            <Path label="AVD home" value={status.android.avdDirectory} />
          </dl>
        </Card>

        <Card title={`Metro listeners (${status.metroListeners.length})`}>
          {status.metroListeners.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Metro process is listening.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 font-medium">Port</th>
                  <th scope="col" className="py-1 font-medium">Directory</th>
                  <th scope="col" className="py-1 text-right font-medium">RSS</th>
                  <th scope="col" className="py-1 text-right font-medium">Up</th>
                </tr>
              </thead>
              <tbody>
                {status.metroListeners.map((listener) => (
                  <tr key={listener.pid} className="border-t">
                    <td className="tabular py-1 font-mono">{listener.port}</td>
                    <td className="max-w-0 truncate py-1 font-mono text-muted-foreground" title={listener.command}>
                      {shortPath(listener.cwd)}
                    </td>
                    <td className="tabular py-1 text-right">{bytes(listener.rssBytes)}</td>
                    <td className="tabular py-1 text-right text-muted-foreground">{listener.elapsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Worktrees (${status.worktrees.length})`} className="md:col-span-2 xl:col-span-2">
          <ul className="divide-y text-xs">
            {status.worktrees.map((worktree) => {
              const lane = laneByWorktree.get(worktree.path);
              return (
                <li key={worktree.path} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono font-medium">{worktree.branch}</span>
                    <span className="block truncate font-mono text-muted-foreground" title={worktree.path}>
                      {shortPath(worktree.path)}
                    </span>
                  </span>
                  {worktree.dirty ? <span className="rounded-sm bg-caution/14 px-1.5 py-0.5 text-[11px] font-medium text-caution">dirty</span> : null}
                  {lane ? (
                    <button
                      type="button"
                      className="press rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
                      onClick={() => navigate({ view: "devices", focusedId: lane.simulatorUdid })}
                    >
                      lane {lane.mode === "release" ? "embedded" : `:${lane.port}`}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Top processes">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-medium">Process</th>
                <th scope="col" className="py-1 text-right font-medium">CPU</th>
                <th scope="col" className="py-1 text-right font-medium">RSS</th>
              </tr>
            </thead>
            <tbody>
              {status.topProcesses.slice(0, 12).map((process) => (
                <tr key={process.pid} className="border-t">
                  <td className="max-w-0 truncate py-1 font-mono" title={process.command}>
                    {process.name} <span className="text-muted-foreground">{process.pid}</span>
                  </td>
                  <td className="tabular py-1 text-right">{process.cpuPercent.toFixed(0)}%</td>
                  <td className="tabular py-1 text-right">{bytes(process.rssBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("space-y-2.5 rounded-xl bg-card p-3.5 shadow-[0_0_0_1px_var(--edge)]", className)}>
      <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Meter({ label, value, text, warn }: { label: string; value: number; text: string; warn: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className={cn("tabular", warn && "font-medium text-caution")}>
          {Math.round(value)}% · {text}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={text}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", warn ? "bg-caution" : "bg-primary/70")} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function Tool({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("grid size-4 place-items-center rounded-full", ok ? "bg-live/15 text-live" : "bg-destructive/10 text-destructive")} aria-hidden>
        {ok ? <CheckIcon className="size-3" strokeWidth={2.5} /> : <XIcon className="size-3" strokeWidth={2.5} />}
      </span>
      <dt className="font-medium">{name}</dt>
      <dd className="min-w-0 truncate text-muted-foreground">
        <span className="sr-only">{ok ? "ok, " : "missing, "}</span>
        {detail}
      </dd>
    </div>
  );
}

function Path({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-mono" title={value}>
        {shortPath(value)}
      </dd>
    </div>
  );
}
