import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { fleet, refresh } from "@/lib/fleet-store";
import { shortPath } from "@/lib/format";
import { ui } from "@/lib/ui-store";

export function StartLaneDialog() {
  const dialog = ui.use((state) => state.laneDialog);
  const status = fleet.use((state) => state.status);
  const devices = fleet.use((state) => state.devices);
  const ids = { worktree: useId(), device: useId(), env: useId(), mode: useId(), hint: useId(), error: useId() };

  const [worktree, setWorktree] = useState("");
  const [device, setDevice] = useState("");
  const [environment, setEnvironment] = useState("");
  const [mode, setMode] = useState<"debug" | "release">("debug");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const environments = useMemo(() => Object.keys(status?.config.variants ?? {}), [status]);
  const worktrees = status?.worktrees ?? [];
  const lanes = status?.sessions ?? [];
  const laneByWorktree = new Map(lanes.map((lane) => [lane.worktreePath, lane]));
  const selectedDevice = devices.find((candidate) => candidate.id === device) ?? null;
  const androidSelected = selectedDevice?.platform === "android";

  // Seed defaults when the dialog opens.
  useEffect(() => {
    if (!dialog.open) return;
    setError(null);
    setDevice(dialog.deviceId ?? "");
    setWorktree((current) => current || worktrees.find((candidate) => !laneByWorktree.has(candidate.path))?.path || worktrees[0]?.path || "");
    setEnvironment((current) => current || environments[0] || "");
    setMode("debug");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog.open, dialog.deviceId]);

  useEffect(() => {
    if (androidSelected && mode === "release") setMode("debug");
  }, [androidSelected, mode]);

  const variant = status?.config.variants[environment]?.[mode];
  const close = () => ui.set({ laneDialog: { open: false } });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!worktree || !device || !environment) {
      setError("Choose a worktree, a device and an environment.");
      return;
    }
    setSubmitting(true);
    try {
      await api.startLane({ worktreePath: worktree, simulatorUdid: device, environment, mode });
      toast.success(mode === "debug" ? `Metro lane started for ${shortPath(worktree)}` : `Release lane created for ${shortPath(worktree)}`);
      close();
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const ios = devices.filter((candidate) => candidate.platform === "ios");
  const android = devices.filter((candidate) => candidate.platform === "android");
  const deviceLabel = (candidate: (typeof devices)[number]) =>
    `${candidate.name} · ${candidate.subtitle}${candidate.live ? "" : ` · ${candidate.state.toLowerCase()}`}${candidate.lane ? " · has lane" : ""}`;

  return (
    <Dialog open={dialog.open} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a lane</DialogTitle>
          <DialogDescription>One worktree, one device, one leased Metro port.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" aria-describedby={variant ? ids.hint : undefined}>
          <Field id={ids.worktree} label="Worktree">
            <Select value={worktree} onValueChange={setWorktree}>
              <SelectTrigger id={ids.worktree} className="w-full">
                <SelectValue placeholder="Choose a worktree" />
              </SelectTrigger>
              <SelectContent>
                {worktrees.map((candidate) => (
                  <SelectItem key={candidate.path} value={candidate.path}>
                    <span className="font-mono">{candidate.branch}</span>
                    <span className="text-muted-foreground"> · {shortPath(candidate.path)}{candidate.dirty ? " · dirty" : ""}{laneByWorktree.has(candidate.path) ? " · has lane" : ""}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id={ids.device} label="Device">
            <Select value={device} onValueChange={setDevice}>
              <SelectTrigger id={ids.device} className="w-full">
                <SelectValue placeholder="Choose a simulator or emulator" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>iOS simulators</SelectLabel>
                  {ios.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {deviceLabel(candidate)}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Android emulators</SelectLabel>
                  {android.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No AVDs installed</p> : null}
                  {android.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {deviceLabel(candidate)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id={ids.env} label="Environment">
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id={ids.env} className="w-full">
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id={ids.mode} label="Build">
              <Select value={mode} onValueChange={(value) => setMode(value as "debug" | "release")}>
                <SelectTrigger id={ids.mode} className="w-full" aria-describedby={androidSelected ? `${ids.mode}-why` : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">debug</SelectItem>
                  <SelectItem value="release" disabled={androidSelected}>
                    release{androidSelected ? " (iOS only)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
              {androidSelected ? (
                <p id={`${ids.mode}-why`} className="text-[11px] text-muted-foreground">
                  Android lanes run debug only; release bundles are not supported on emulators yet.
                </p>
              ) : null}
            </Field>
          </div>

          {variant ? (
            <p id={ids.hint} className="text-xs text-muted-foreground">
              {variant.appName} · <span className="font-mono">{variant.bundleId}</span>
              {mode === "debug" ? (
                <>
                  {" "}· Metro ports <span className="tabular">{variant.portRange[0]}–{variant.portRange[1]}</span>
                </>
              ) : (
                " · embedded JS bundle, no Metro port"
              )}
            </p>
          ) : null}

          {error ? (
            <p id={ids.error} role="alert" className="rounded-lg bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" className="press" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className="press" disabled={submitting}>
              {submitting ? "Starting…" : mode === "debug" ? "Start Metro" : "Create lane"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
