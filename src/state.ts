import fs from "node:fs";
import path from "node:path";
import { FLEET_CONFIG, type AppEnvironment, type BuildMode } from "./config";

export type DevicePlatform = "ios" | "android";

export type FleetSession = {
  id: string;
  /** Absent on lanes recorded before Android support; those are iOS. */
  platform?: DevicePlatform;
  branch: string;
  worktreePath: string;
  /** iOS simulator UDID, or the AVD name for an Android lane. */
  simulatorUdid: string;
  environment: AppEnvironment;
  mode: BuildMode;
  bundleId: string;
  port: number | null;
  metroPid: number | null;
  logPath: string;
  startedAt: string;
};

/**
 * An agent session that claimed or recently drove a device. Touches are
 * recorded automatically from CLI requests; claims are explicit and last
 * until released or until the agent session ends.
 */
export type DeviceAttachment = {
  deviceId: string;
  platform: DevicePlatform;
  agent: string;
  sessionId: string;
  source: "claim" | "touch";
  note?: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

type FleetState = {
  version: 1;
  sessions: FleetSession[];
  attachments?: DeviceAttachment[];
};

const statePath = path.join(FLEET_CONFIG.stateDirectory, "state.json");

export function loadState(): FleetState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as FleetState;
    if (parsed.version === 1 && Array.isArray(parsed.sessions)) return parsed;
  } catch {
    // A missing state file is the normal first-run case.
  }
  return { version: 1, sessions: [] };
}

export function sessionPlatform(session: FleetSession): DevicePlatform {
  return session.platform || "ios";
}

export function saveState(state: FleetState): void {
  fs.mkdirSync(FLEET_CONFIG.stateDirectory, { recursive: true });
  const temporaryPath = `${statePath}.next`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporaryPath, statePath);
}

export function updateState(mutator: (state: FleetState) => void): FleetState {
  const state = loadState();
  mutator(state);
  saveState(state);
  return state;
}

export function logPathFor(sessionId: string): string {
  const logsDirectory = path.join(FLEET_CONFIG.stateDirectory, "logs");
  fs.mkdirSync(logsDirectory, { recursive: true });
  return path.join(logsDirectory, `${sessionId}.log`);
}
