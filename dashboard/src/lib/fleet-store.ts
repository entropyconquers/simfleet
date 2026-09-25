import { api, OfflineError } from "./api";
import { toDevices, type Device } from "./devices";
import { createStore } from "./store";
import type { Status } from "./types";

export type FleetState = {
  status: Status | null;
  devices: Device[];
  /** True once the first request has settled, success or not. */
  settled: boolean;
  /** Set when the last poll failed; the previous payload is kept. */
  error: string | null;
  offline: boolean;
  fetching: boolean;
  lastUpdatedAt: number | null;
};

export const fleet = createStore<FleetState>({
  status: null,
  devices: [],
  settled: false,
  error: null,
  offline: false,
  fetching: false,
  lastUpdatedAt: null,
});

const INTERVAL_MS = 4000;
const HIDDEN_INTERVAL_MS = 15000;
let timer = 0;
let inFlight: Promise<void> | null = null;

/** One request at a time; the next poll is scheduled only after this one settles. */
export function refresh(): Promise<void> {
  if (inFlight) return inFlight;
  fleet.set({ fetching: true });
  inFlight = api
    .status()
    .then((status) => {
      // A rebuilt dashboard reloads open tabs so they never run stale code.
      if (status.dashboardBuild) {
        if (loadedBuild === null) loadedBuild = status.dashboardBuild;
        else if (loadedBuild !== status.dashboardBuild) {
          location.reload();
          return;
        }
      }
      fleet.set({
        status,
        devices: toDevices(status),
        error: null,
        offline: false,
        settled: true,
        lastUpdatedAt: Date.now(),
      });
    })
    .catch((error: unknown) => {
      fleet.set({
        error: error instanceof Error ? error.message : String(error),
        offline: error instanceof OfflineError,
        settled: true,
      });
    })
    .finally(() => {
      inFlight = null;
      fleet.set({ fetching: false });
      schedule();
    });
  return inFlight;
}

let loadedBuild: string | null = null;

function schedule() {
  clearTimeout(timer);
  const delay = document.hidden ? HIDDEN_INTERVAL_MS : fleet.get().offline ? 6000 : INTERVAL_MS;
  timer = window.setTimeout(() => void refresh(), delay);
}

export function startPolling() {
  void refresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
}

export function deviceById(id: string | null): Device | null {
  if (!id) return null;
  return fleet.get().devices.find((device) => device.id === id) ?? null;
}
