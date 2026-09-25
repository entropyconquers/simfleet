import { toast } from "sonner";
import { api, waitForJob } from "./api";
import type { Device } from "./devices";
import { refresh } from "./fleet-store";
import type { Lane, Platform } from "./types";

export type Lifecycle = "boot" | "slim" | "restore" | "shutdown" | "open" | "tune";

const VERBS: Record<Lifecycle, { progress: string; done: string }> = {
  boot: { progress: "Booting", done: "Booted" },
  slim: { progress: "Slimming", done: "Slimmed" },
  restore: { progress: "Restoring", done: "Restored" },
  shutdown: { progress: "Shutting down", done: "Shut down" },
  open: { progress: "Opening", done: "Opened" },
  tune: { progress: "Tuning", done: "Tuned" },
};

/** Destructive actions require confirmation before they reach this function. */
export const DESTRUCTIVE: ReadonlySet<Lifecycle> = new Set(["shutdown", "restore", "slim"]);

export function lifecycleActions(device: Device, avdslimInstalled: boolean): Array<{
  action: Lifecycle;
  label: string;
  description: string;
  disabled?: string;
  tone?: "primary" | "danger";
}> {
  const busy = device.operation
    ? `${VERBS[device.operation.action as Lifecycle]?.progress ?? device.operation.action} in progress`
    : device.transitioning
      ? `${device.state}…`
      : undefined;
  const needsAvdslim = device.platform === "android" && !avdslimInstalled ? "avdslim is not installed" : undefined;
  if (device.platform === "ios") {
    if (device.live) {
      return [
        { action: "open", label: "Open in Simulator.app", description: "Bring the Simulator window to the front", disabled: busy },
        device.slim.level === "verified"
          ? { action: "restore", label: "Restore stock services", description: "Re-enable every service and reboot", disabled: busy }
          : {
              action: "slim",
              label: device.slim.level === "partial" ? "Retry slim" : "Slim services",
              description: "Disable unneeded services, verify the profile and reboot",
              disabled: busy,
            },
        { action: "shutdown", label: "Shut down", description: "Power off this simulator", disabled: busy, tone: "danger" },
      ];
    }
    return [{ action: "boot", label: "Boot", description: "Boot with the slim service profile", disabled: busy, tone: "primary" }];
  }
  if (device.live) {
    return [
      device.slim.level === "verified"
        ? { action: "restore", label: "Restore packages", description: "Re-enable disabled packages and reboot", disabled: busy ?? needsAvdslim }
        : { action: "slim", label: "Slim packages", description: "Disable unneeded packages with avdslim and reboot", disabled: busy ?? needsAvdslim },
      { action: "shutdown", label: "Shut down", description: "Power off this emulator", disabled: busy ?? needsAvdslim, tone: "danger" },
    ];
  }
  return [
    { action: "boot", label: "Boot", description: "Boot this AVD (headless)", disabled: busy ?? needsAvdslim, tone: "primary" },
    ...(device.slim.level === "tuned" || device.slim.level === "verified"
      ? []
      : [{ action: "tune" as const, label: "Tune AVD", description: "Apply avdslim's RAM and GPU settings", disabled: busy ?? needsAvdslim }]),
  ];
}

export async function runLifecycle(
  platform: Platform,
  id: string,
  name: string,
  action: Lifecycle,
  options?: Record<string, unknown>,
): Promise<boolean> {
  const verbs = VERBS[action];
  const toastId = toast.loading(`${verbs.progress} ${name}…`);
  try {
    const { pollUrl } = await api.lifecycle(platform, id, action, options);
    void refresh();
    await waitForJob(pollUrl);
    toast.success(`${verbs.done} ${name}`, { id: toastId });
    void refresh();
    return true;
  } catch (error) {
    toast.error(`${verbs.progress} ${name} failed`, {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
      duration: Infinity,
      closeButton: true,
    });
    void refresh();
    return false;
  }
}

export async function launchLane(lane: Lane, deviceName: string): Promise<boolean> {
  const toastId = toast.loading(`Launching ${lane.bundleId} on ${deviceName}…`);
  try {
    const result = await api.laneAction(lane.id, "launch");
    if (result.pollUrl) await waitForJob(result.pollUrl);
    toast.success(`Launched ${lane.bundleId} on ${deviceName}`, { id: toastId });
    void refresh();
    return true;
  } catch (error) {
    toast.error(`Launch on ${deviceName} failed`, {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
      duration: Infinity,
      closeButton: true,
    });
    return false;
  }
}

export async function stopLane(lane: Lane): Promise<boolean> {
  const toastId = toast.loading(`Stopping lane ${lane.branch}…`);
  try {
    await api.laneAction(lane.id, "stop");
    toast.success(`Stopped lane ${lane.branch}`, { id: toastId });
    void refresh();
    return true;
  } catch (error) {
    toast.error(`Stopping lane ${lane.branch} failed`, {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
      duration: Infinity,
      closeButton: true,
    });
    return false;
  }
}

export async function copyText(text: string, what = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Clipboard is not available in this context");
  }
}
