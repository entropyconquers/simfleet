import { bytes, runtimeLabel } from "./format";
import type { DeviceAgent, Emulator, Lane, Operation, Platform, Simulator, Status } from "./types";

export type SlimLevel = "verified" | "partial" | "stock" | "tuned" | "unknown";

/** One row on the wall: an iOS simulator or an Android emulator in a common shape. */
export type Device = {
  platform: Platform;
  id: string;
  name: string;
  subtitle: string;
  state: string;
  live: boolean;
  transitioning: boolean;
  operation: Operation;
  agents: DeviceAgent[];
  lane: Lane | null;
  memoryBytes: number | null;
  memoryLabel: string;
  memoryDetail: string;
  slim: { level: SlimLevel; label: string; detail: string };
  raw: Simulator | Emulator;
};

const TRANSITIONAL_STATES = new Set(["Booting", "Shutting Down", "Offline"]);

function slimForSimulator(sim: Simulator): Device["slim"] {
  const disabled = sim.simSlim?.managedDisabled || 0;
  const total = sim.simSlim?.managedTotal || 0;
  if (sim.simSlim?.verified) {
    return {
      level: "verified",
      label: "Slimmed",
      detail: `SimSlim verified: ${disabled} of ${total} managed services disabled`,
    };
  }
  if (disabled > 0) {
    return {
      level: "partial",
      label: "Partial",
      detail: `SimSlim has not verified this device; ${disabled} of ${total} services disabled`,
    };
  }
  if (sim.simSlim) return { level: "stock", label: "Stock", detail: "Stock service set; slim it to save memory" };
  return { level: "unknown", label: "Not slimmed", detail: "SimSlim has no record of this device" };
}

function slimForEmulator(emu: Emulator): Device["slim"] {
  if (emu.avdSlim?.slimmed) {
    return {
      level: "verified",
      label: "Slimmed",
      detail: `avdslim ${emu.avdSlim.preset ? `preset ${emu.avdSlim.preset}, ` : ""}${emu.avdSlim.disabledPackages} packages disabled`,
    };
  }
  if (emu.tuned) {
    return { level: "tuned", label: "Tuned", detail: "AVD config tuned by avdslim; packages not slimmed yet" };
  }
  return { level: "stock", label: "Stock", detail: "Untuned AVD; tune or slim it to save memory" };
}

export function toDevices(status: Status): Device[] {
  const lanes = new Map(status.sessions.map((lane) => [lane.simulatorUdid, lane]));
  const ios: Device[] = status.simulators.map((sim) => {
    const live = sim.state === "Booted";
    const footprint = sim.simSlim?.memory?.bytes ?? null;
    return {
      platform: "ios",
      id: sim.udid,
      name: sim.name,
      subtitle: runtimeLabel(sim.runtime),
      state: sim.state,
      live,
      transitioning: Boolean(sim.operation) || TRANSITIONAL_STATES.has(sim.state),
      operation: sim.operation,
      agents: sim.agents,
      lane: lanes.get(sim.udid) ?? null,
      memoryBytes: live ? (footprint ?? sim.rssBytes) : null,
      memoryLabel: live ? bytes(footprint ?? sim.rssBytes) : bytes(sim.dataSizeBytes),
      memoryDetail: live
        ? footprint
          ? "Physical footprint of the whole simulator process tree"
          : "Summed resident set size of simulator processes"
        : "Data on disk",
      slim: slimForSimulator(sim),
      raw: sim,
    };
  });
  const android: Device[] = status.emulators.map((emu) => {
    const live = emu.state === "Booted";
    const memory = emu.footprintBytes ?? emu.rssBytes;
    return {
      platform: "android",
      id: emu.avd,
      name: emu.displayName,
      subtitle: `API ${emu.apiLevel ?? "?"}${emu.playStore ? " · Play" : ""}`,
      state: emu.state,
      live,
      transitioning: Boolean(emu.operation) || TRANSITIONAL_STATES.has(emu.state),
      operation: emu.operation,
      agents: emu.agents,
      lane: lanes.get(emu.avd) ?? null,
      memoryBytes: live ? memory : null,
      memoryLabel: live ? bytes(memory) : emu.config.ramMb ? `${emu.config.ramMb} MB RAM` : "—",
      memoryDetail: live
        ? emu.footprintBytes
          ? "Physical footprint of the emulator process"
          : "Resident set size of the emulator process"
        : "Configured RAM for this AVD",
      slim: slimForEmulator(emu),
      raw: emu,
    };
  });
  return [...ios, ...android].sort(rank);
}

function rankOf(device: Device): number {
  if (device.live) return device.agents.length ? 0 : device.lane ? 1 : 2;
  if (device.transitioning) return 3;
  return 4;
}

function rank(a: Device, b: Device): number {
  return (
    rankOf(a) - rankOf(b) ||
    a.platform.localeCompare(b.platform) ||
    a.name.localeCompare(b.name) ||
    a.subtitle.localeCompare(b.subtitle)
  );
}

export type PlatformFilter = "all" | Platform;
export type StateFilter = "all" | "running" | "lane" | "agent";

export function matchesFilters(
  device: Device,
  platform: PlatformFilter,
  state: StateFilter,
  query: string,
): boolean {
  if (platform !== "all" && device.platform !== platform) return false;
  if (state === "running" && !device.live) return false;
  if (state === "lane" && !device.lane) return false;
  if (state === "agent" && device.agents.length === 0) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    device.name,
    device.id,
    device.subtitle,
    device.state,
    device.lane?.branch,
    device.lane?.environment,
    ...device.agents.map((agent) => `${agent.kind} ${agent.title}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function laneHealth(lane: Lane): { label: string; tone: "live" | "caution" | "danger" } {
  if (lane.healthy) return { label: "ready", tone: "live" };
  if (lane.processRunning) return { label: "starting", tone: "caution" };
  return { label: "stopped", tone: "danger" };
}

export function viaLabel(via: DeviceAgent["via"]): string {
  switch (via) {
    case "claim":
      return "claimed";
    case "touch":
      return "recently active";
    case "lane-worktree":
      return "same worktree";
  }
}

export function kindLabel(kind: DeviceAgent["kind"]): string {
  return kind === "claude" ? "Claude" : "Codex";
}

export function deviceHash(device: Pick<Device, "id">): string {
  return `#device/${encodeURIComponent(device.id)}`;
}
