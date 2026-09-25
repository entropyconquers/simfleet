import { useId, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import {
  CameraIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  VibrateIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { copyText, DESTRUCTIVE, launchLane, lifecycleActions, runLifecycle, stopLane, type Lifecycle } from "@/lib/actions";
import type { Device } from "@/lib/devices";
import { bytes, shortPath, timeAgo } from "@/lib/format";
import { refresh } from "@/lib/fleet-store";
import { ANDROID_BUTTONS, AVDSLIM_INSTALL, IOS_BUTTONS, type Orientation, type Status } from "@/lib/types";
import { ui } from "@/lib/ui-store";
import { useNow } from "@/hooks/use-now";
import { AgentGlyph, LaneChip, SlimChip } from "./chips";
import { ConfirmDialog, type Confirmation } from "./confirm-dialog";
import { LogDialog } from "./log-dialog";
import type { ScreenHandle } from "./device-screen";
import { kindLabel, viaLabel } from "@/lib/devices";

const ORIENTATIONS: Orientation[] = ["portrait", "landscape-left", "portrait-upside-down", "landscape-right"];

const BUTTON_LABELS: Record<string, string> = {
  home: "Home",
  lock: "Lock",
  power: "Power",
  back: "Back",
  menu: "Menu",
  "app-switcher": "Switcher",
  "volume-up": "Vol +",
  "volume-down": "Vol −",
  action: "Action",
};

export function Inspector({ device, screen, status }: { device: Device; screen: RefObject<ScreenHandle | null>; status: Status | null }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const avdslimInstalled = status?.android.avdslim.installed ?? true;
  const live = device.live;

  const input = async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      await api.input(device.platform, device.id, payload);
      screen.current?.refresh();
    } catch (error) {
      toast.error(`${device.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const rotate = () => {
    const next = ORIENTATIONS[(ORIENTATIONS.indexOf(orientation) + 1) % ORIENTATIONS.length];
    void input({ kind: "orientation", orientation: next }, "rotate").then(() => setOrientation(next));
  };

  const lifecycle = (action: Lifecycle, label: string) => {
    const run = () => void runLifecycle(device.platform, device.id, device.name, action, device.platform === "android" && action === "boot" ? { headless: true } : undefined);
    if (DESTRUCTIVE.has(action)) {
      const copy: Record<string, { title: string; description: string }> = {
        shutdown: { title: `Shut down ${device.name}?`, description: "Running apps stop and any attached lane loses its device until it boots again." },
        restore: { title: `Restore ${device.name}?`, description: "Every disabled service is re-enabled and the device reboots. Memory use goes back to stock." },
        slim: { title: `Slim ${device.name}?`, description: "Unneeded services are disabled and the device reboots. Apps keep their data." },
      };
      setConfirmation({ ...copy[action], confirmLabel: label, tone: action === "shutdown" ? "danger" : "default", onConfirm: run });
      return;
    }
    run();
  };

  const buttons = device.platform === "ios" ? IOS_BUTTONS : ANDROID_BUTTONS;

  return (
    <aside aria-label="Device controls" className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto rounded-xl bg-card p-3 shadow-[0_0_0_1px_var(--edge)] lg:w-[340px] lg:p-4">
      <Section title="Lifecycle">
        <div className="flex flex-wrap gap-1.5">
          {lifecycleActions(device, avdslimInstalled).map((item) => (
            <Button
              key={item.action}
              size="sm"
              variant={item.tone === "danger" ? "destructive" : item.tone === "primary" ? "default" : "outline"}
              className="press"
              disabled={Boolean(item.disabled)}
              title={item.disabled ?? item.description}
              onClick={() => lifecycle(item.action, item.label)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {device.operation ? (
          <p className="text-xs text-muted-foreground" role="status">
            {device.operation.action} started {timeAgo(device.operation.startedAt, now)}
          </p>
        ) : null}
        {device.platform === "android" && !avdslimInstalled ? (
          <InstallHint />
        ) : null}
      </Section>

      <Separator />

      <Section title="Hardware">
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((button) => (
            <Button
              key={button}
              size="sm"
              variant="outline"
              className="press"
              disabled={!live || busy === button}
              onClick={() => void input({ kind: "button", button }, button)}
            >
              {BUTTON_LABELS[button] ?? button}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="press" disabled={!live || busy === "rotate"} onClick={rotate} title={`Current: ${orientation}`}>
            <RotateCcwIcon data-icon="inline-start" />
            Rotate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="press"
            disabled={!live || busy === "shake"}
            onClick={() => void input({ kind: device.platform === "ios" ? "shake" : "dev-menu" }, "shake")}
          >
            <VibrateIcon data-icon="inline-start" />
            {device.platform === "ios" ? "Shake" : "Dev menu"}
          </Button>
          <Button size="sm" variant="outline" className="press" disabled={!live} onClick={() => screen.current?.saveFrame()}>
            <CameraIcon data-icon="inline-start" />
            Save screenshot
          </Button>
        </div>
      </Section>

      <TypeForm disabled={!live} onSend={(text) => input({ kind: "text", text }, "text")} />
      <TapForm disabled={!live} platform={device.platform} onSend={(payload) => input(payload, "tap-at")} />
      <UrlForm disabled={!live} onSend={(url) => input({ kind: "open-url", url }, "url")} />

      <Separator />

      <Section title="Lane">
        {device.lane ? (
          <LanePanel device={device} onLog={() => setLogOpen(true)} onStop={() => setConfirmation({
            title: `Stop lane ${device.lane?.branch}?`,
            description: "Metro stops and the device is released for another worktree.",
            confirmLabel: "Stop lane",
            tone: "danger",
            onConfirm: () => void stopLane(device.lane!),
          })} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No lane on this device.</p>
            <Button size="sm" variant="outline" className="press" onClick={() => ui.set({ laneDialog: { open: true, deviceId: device.id } })}>
              Start a lane here
            </Button>
          </div>
        )}
      </Section>

      <Separator />

      <Section title="Agents">
        {device.agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Claude or Codex session is attached.</p>
        ) : (
          <ul className="space-y-2">
            {device.agents.map((agent) => (
              <li key={`${agent.kind}:${agent.sessionId}`} className={cn("rounded-lg border-l-2 bg-muted/40 py-1.5 pr-2 pl-2.5", agent.kind === "claude" ? "border-claude" : "border-codex")}>
                <div className="flex items-center gap-1.5">
                  <AgentGlyph kind={agent.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={agent.title}>
                    <span className="sr-only">{kindLabel(agent.kind)} </span>
                    {agent.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{viaLabel(agent.via)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {agent.cwd ? <span className="truncate font-mono" title={agent.cwd}>{shortPath(agent.cwd)}</span> : null}
                  <span className="ml-auto shrink-0">{agent.status ?? "—"} · {timeAgo(agent.lastSeenAt ?? agent.updatedAt, now)}</span>
                </div>
                {agent.via === "claim" ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="press mt-1 -ml-1"
                    onClick={() =>
                      setConfirmation({
                        title: `Release ${kindLabel(agent.kind)}'s claim on ${device.name}?`,
                        description: "The session keeps running; only the device claim is removed.",
                        confirmLabel: "Release claim",
                        onConfirm: () =>
                          void api
                            .releaseClaim(device.id, agent.kind, agent.sessionId)
                            .then(() => {
                              toast.success("Claim released");
                              void refresh();
                            })
                            .catch((error: Error) => toast.error(error.message)),
                      })
                    }
                  >
                    Release claim
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Separator />

      <Section title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <Row label={device.platform === "ios" ? "UDID" : "AVD"}>
            <button
              type="button"
              className="press inline-flex max-w-full items-center gap-1 rounded-sm font-mono text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
              onClick={() => void copyText(device.id, `${device.platform === "ios" ? "UDID" : "AVD name"} copied`)}
              aria-label={`Copy ${device.id}`}
            >
              <span className="truncate">{device.id}</span>
              <CopyIcon className="size-3 shrink-0" aria-hidden />
            </button>
          </Row>
          <Row label={device.platform === "ios" ? "Runtime" : "System"}>
            {device.platform === "ios" ? device.subtitle : (device.raw as Extract<Device["raw"], { platform: "android" }>).systemImage ?? device.subtitle}
          </Row>
          <Row label="Memory">
            <span className="tabular">{device.memoryLabel}</span> <span className="text-muted-foreground">{device.memoryDetail.toLowerCase()}</span>
          </Row>
          <Row label="Slim">
            <span className="inline-flex items-center gap-1.5">
              <SlimChip device={device} />
              <span className="text-muted-foreground">{device.slim.detail}</span>
            </span>
          </Row>
          {device.platform === "ios" ? (
            <IosDetails device={device} />
          ) : (
            <AndroidDetails device={device} />
          )}
        </dl>
      </Section>

      <ConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />
      {device.lane ? <LogDialog lane={device.lane} open={logOpen} onOpenChange={setLogOpen} /> : null}
    </aside>
  );
}

function IosDetails({ device }: { device: Device }) {
  const sim = device.raw as Extract<Device["raw"], { platform: "ios" }>;
  return (
    <>
      <Row label="Processes">
        <span className="tabular">{sim.simSlim?.memory?.processes ?? sim.processCount}</span>
      </Row>
      {sim.topProcesses?.length ? (
        <Row label="Top">
          <ul className="space-y-0.5">
            {sim.topProcesses.slice(0, 4).map((process) => (
              <li key={process.name} className="flex justify-between gap-2">
                <span className="truncate font-mono">{process.name}</span>
                <span className="tabular shrink-0 text-muted-foreground">{bytes(process.rssBytes)}</span>
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
      <Row label="On disk">
        <span className="tabular">{bytes(sim.dataSizeBytes)}</span>
      </Row>
    </>
  );
}

function AndroidDetails({ device }: { device: Device }) {
  const emu = device.raw as Extract<Device["raw"], { platform: "android" }>;
  return (
    <>
      <Row label="Serial">
        <span className="font-mono">{emu.serial ?? "—"}</span>
      </Row>
      <Row label="Config">
        <span className="tabular">
          {emu.config.ramMb ? `${emu.config.ramMb} MB RAM` : "—"} · GPU {emu.config.gpuMode ?? "—"} · {emu.abi ?? "—"}
        </span>
      </Row>
      <Row label="Snapshot">{emu.goldenSnapshot ? "Golden snapshot ready" : "No golden snapshot"}</Row>
    </>
  );
}

function LanePanel({ device, onLog, onStop }: { device: Device; onLog: () => void; onStop: () => void }) {
  const lane = device.lane!;
  const [launching, setLaunching] = useState(false);
  return (
    <div className="space-y-2">
      <LaneChip lane={lane} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Row label="Worktree">
          <span className="truncate font-mono" title={lane.worktreePath}>
            {shortPath(lane.worktreePath)}
          </span>
        </Row>
        <Row label="App">
          <span className="font-mono">{lane.bundleId}</span>
        </Row>
        <Row label="Metro">
          <span className="tabular">{lane.mode === "release" ? "embedded bundle" : `port ${lane.port} · pid ${lane.metroPid ?? "—"}`}</span>
        </Row>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="press"
          disabled={!device.live || !lane.healthy || launching}
          title={!device.live ? "Boot the device first" : !lane.healthy ? "Metro is not ready yet" : lane.mode === "release" ? "Install the cached shell with this lane's embedded JS" : "Launch the app against this lane's Metro"}
          onClick={() => {
            setLaunching(true);
            void launchLane(lane, device.name).finally(() => setLaunching(false));
          }}
        >
          <PlayIcon data-icon="inline-start" />
          {launching ? "Launching…" : "Launch app"}
        </Button>
        <Button size="sm" variant="outline" className="press" onClick={onLog}>
          <FileTextIcon data-icon="inline-start" />
          Log
        </Button>
        <Button size="sm" variant="destructive" className="press" onClick={onStop}>
          <SquareIcon data-icon="inline-start" />
          Stop lane
        </Button>
      </div>
    </div>
  );
}

function TypeForm({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => Promise<void> }) {
  const id = useId();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text) return;
    setSending(true);
    void onSend(text).then(() => setText("")).finally(() => setSending(false));
  };
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        Type into the device
      </Label>
      <Textarea
        id={id}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Text goes to the focused field on the device"
        disabled={disabled}
        className="min-h-14 text-sm"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="press" disabled={disabled || sending || !text}>
          <SendIcon data-icon="inline-start" />
          {sending ? "Sending…" : "Send text"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="press"
          disabled={disabled}
          onClick={() =>
            navigator.clipboard
              .readText()
              .then((clip) => (clip ? onSend(clip) : toast.error("Your clipboard is empty")))
              .catch(() => toast.error("Clipboard access was denied"))
          }
        >
          Paste clipboard
        </Button>
      </div>
    </form>
  );
}

function TapForm({ disabled, platform, onSend }: { disabled: boolean; platform: Device["platform"]; onSend: (payload: Record<string, unknown>) => Promise<void> }) {
  const xId = useId();
  const yId = useId();
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    // Percentages of the screen: a 100×100 frame lets the server scale for either platform.
    void onSend({ kind: "tap", x: px, y: py, width: 100, height: 100 });
  };
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <p className="text-xs font-medium" id={`${xId}-legend`}>
        Tap at a point (keyboard alternative to clicking the screen)
      </p>
      <div className="flex items-end gap-1.5" role="group" aria-labelledby={`${xId}-legend`}>
        <div className="w-20">
          <Label htmlFor={xId} className="text-[11px] text-muted-foreground">
            X (% of width)
          </Label>
          <Input id={xId} inputMode="decimal" value={x} onChange={(event) => setX(event.target.value)} disabled={disabled} className="h-7 text-sm" placeholder="50" />
        </div>
        <div className="w-20">
          <Label htmlFor={yId} className="text-[11px] text-muted-foreground">
            Y (% of height)
          </Label>
          <Input id={yId} inputMode="decimal" value={y} onChange={(event) => setY(event.target.value)} disabled={disabled} className="h-7 text-sm" placeholder="50" />
        </div>
        <Button type="submit" size="sm" variant="outline" className="press" disabled={disabled || !x || !y}>
          Tap
        </Button>
        <span className="sr-only">{platform === "ios" ? "Coordinates are scaled to the simulator screen." : "Coordinates are scaled to the emulator screen."}</span>
      </div>
    </form>
  );
}

function UrlForm({ disabled, onSend }: { disabled: boolean; onSend: (url: string) => Promise<void> }) {
  const id = useId();
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (url.trim()) void onSend(url.trim());
      }}
      className="space-y-1.5"
    >
      <Label htmlFor={id} className="text-xs font-medium">
        Open a URL or deep link
      </Label>
      <div className="flex gap-1.5">
        <Input id={id} type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={disabled} className="h-7 font-mono text-xs" placeholder="zkp2p-dev://…" autoComplete="off" spellCheck={false} />
        <Button type="submit" size="sm" variant="outline" className="press" disabled={disabled || !url.trim()}>
          <ExternalLinkIcon data-icon="inline-start" />
          Open
        </Button>
      </div>
    </form>
  );
}

export function InstallHint() {
  return (
    <div className="space-y-1.5 rounded-lg bg-caution/10 p-2.5 text-xs">
      <p className="font-medium text-caution">avdslim is not installed, so Android lifecycle actions are unavailable.</p>
      <div className="flex items-start gap-1.5">
        <code className="min-w-0 flex-1 rounded-sm bg-background/70 px-1.5 py-1 font-mono text-[11px] leading-snug break-all">{AVDSLIM_INSTALL}</code>
        <Button size="icon-xs" variant="ghost" className="press shrink-0" aria-label="Copy install command" onClick={() => void copyText(AVDSLIM_INSTALL, "Install command copied")}>
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </>
  );
}
