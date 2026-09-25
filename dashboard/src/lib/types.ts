/** Shapes returned by the fleet server (src/server.ts, src/android.ts, src/agents.ts). */

export type Platform = "ios" | "android";
export type AgentKind = "claude" | "codex";
export type AttachmentVia = "claim" | "touch" | "lane-worktree";

export type AgentSession = {
  kind: AgentKind;
  sessionId: string;
  title: string;
  cwd: string;
  status: string | null;
  pid: number | null;
  startedAt: string | null;
  updatedAt: string | null;
};

export type DeviceAgent = AgentSession & {
  via: AttachmentVia;
  lastSeenAt: string | null;
  note?: string;
};

export type Operation = { action: string; startedAt: string } | null;

export type SimSlimDevice = {
  udid: string;
  managedDisabled?: number;
  managedTotal: number;
  memory?: { processes: number; bytes: number; cpu: number };
  verified?: boolean;
};

export type Simulator = {
  platform: "ios";
  udid: string;
  name: string;
  runtime: string;
  state: string;
  dataSizeBytes: number;
  processCount: number;
  rssBytes: number;
  topProcesses: Array<{ name: string; rssBytes: number }>;
  simSlim: SimSlimDevice | null;
  operation: Operation;
  agents: DeviceAgent[];
};

export type AvdSlimState = {
  slimmed: boolean;
  preset: string | null;
  disabledPackages: number;
  slimmedAt: string | null;
};

export type Emulator = {
  platform: "android";
  avd: string;
  displayName: string;
  state: "Booted" | "Booting" | "Offline" | "Shutdown";
  serial: string | null;
  apiLevel: string | null;
  systemImage: string | null;
  abi: string | null;
  playStore: boolean;
  config: { ramMb: number | null; gpuMode: string | null; heapMb: number | null };
  tuned: boolean;
  goldenSnapshot: boolean;
  hostPid: number | null;
  rssBytes: number;
  footprintBytes: number | null;
  avdSlim: AvdSlimState | null;
  operation: Operation;
  agents: DeviceAgent[];
};

export type Lane = {
  id: string;
  platform: Platform;
  branch: string;
  worktreePath: string;
  simulatorUdid: string;
  environment: string;
  mode: "debug" | "release";
  bundleId: string;
  port: number | null;
  metroPid: number | null;
  logPath: string;
  startedAt: string;
  processRunning: boolean;
  healthy: boolean;
};

export type Worktree = { path: string; branch: string; dirty: boolean };

export type Variant = {
  appName: string;
  bundleId: string;
  scheme: string;
  legacySchemes: string[];
  googleServicesFile: string;
  portRange: [number, number];
};

export type AndroidToolchain = {
  sdkDirectory: string | null;
  adbPath: string | null;
  emulatorPath: string | null;
  avdslim: { installed: boolean; path: string | null; version: string | null };
  avdDirectory: string;
};

export type MetroListener = {
  pid: number;
  port: number;
  rssBytes: number;
  elapsed: string;
  cwd: string;
  command: string;
};

export type TopProcess = {
  pid: number;
  ppid: number;
  rssKb: number;
  cpuPercent: number;
  elapsed: string;
  command: string;
  executablePath: string;
  rssBytes: number;
  name: string;
};

export type Status = {
  generatedAt: string;
  repoRoot: string;
  projectName: string;
  config: {
    variants: Record<string, Record<string, Variant>>;
    nativeAuth: unknown;
    appProcessNames: string[];
    metroMaxWorkers: number;
    screenshotRefreshMs: number;
  };
  memory: {
    totalBytes: number;
    freePercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
  };
  worktrees: Worktree[];
  simulators: Simulator[];
  simSlim: {
    installed: boolean;
    version: string | null;
    profilePath: string | null;
    devices: SimSlimDevice[];
    stale?: boolean;
  };
  emulators: Emulator[];
  android: AndroidToolchain;
  agentSessions: AgentSession[];
  simulatorControl: {
    available: boolean;
    port: number;
    running: boolean;
    streamEndpoint: string;
  };
  metroListeners: MetroListener[];
  topProcesses: TopProcess[];
  sessions: Lane[];
};

export type Job = {
  id: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
  error?: string;
  result?: Record<string, unknown>;
};

export type IosDefinition = {
  identity?: { model?: string; name?: string; udid?: string };
  screen: {
    rect: { x: number; y: number; width: number; height: number };
    viewport?: { width: number; height: number };
    clipRadius?: number;
  };
};

export type AndroidDefinition = {
  platform: "android";
  avd: string;
  serial: string;
  screen: { rect: { width: number; height: number }; density: number | null };
  coordinateSpace: "device-pixels";
};

export type Orientation = "portrait" | "landscape-left" | "landscape-right" | "portrait-upside-down";

export const IOS_BUTTONS = [
  "home",
  "lock",
  "app-switcher",
  "volume-up",
  "volume-down",
  "action",
] as const;
export const ANDROID_BUTTONS = [
  "home",
  "back",
  "app-switcher",
  "menu",
  "lock",
  "power",
  "volume-up",
  "volume-down",
] as const;

export const AVDSLIM_INSTALL =
  "brew tap kdbhalala/avdslim https://github.com/kdbhalala/avdslim.git && brew install avdslim";
