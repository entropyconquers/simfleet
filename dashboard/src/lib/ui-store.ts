import { createStore } from "./store";
import type { PlatformFilter, StateFilter } from "./devices";

export type View = "devices" | "agents" | "host";

export type UiState = {
  view: View;
  focusedId: string | null;
  platform: PlatformFilter;
  state: StateFilter;
  query: string;
  tile: number;
  laneDialog: { open: boolean; deviceId?: string };
  helpOpen: boolean;
  /** Streams pause after the tab has been hidden for a while. */
  hidden: boolean;
};

const TILE_KEY = "simfleet.tile";
const DENSITY_MIN = 150;
const DENSITY_MAX = 420;

function storedTile(): number {
  try {
    const raw = Number(localStorage.getItem(TILE_KEY));
    if (Number.isFinite(raw) && raw >= DENSITY_MIN && raw <= DENSITY_MAX) return raw;
  } catch {
    // Storage may be blocked; the default is fine.
  }
  return 240;
}

function fromHash(): Pick<UiState, "view" | "focusedId"> {
  const hash = location.hash.slice(1);
  const device = hash.match(/^device\/(.+)$/);
  if (device) return { view: "devices", focusedId: decodeURIComponent(device[1]) };
  if (hash === "agents" || hash === "host") return { view: hash, focusedId: null };
  return { view: "devices", focusedId: null };
}

export const ui = createStore<UiState>({
  ...fromHash(),
  platform: "all",
  state: "all",
  query: "",
  tile: storedTile(),
  laneDialog: { open: false },
  helpOpen: false,
  hidden: document.hidden,
});

export const DENSITY = { min: DENSITY_MIN, max: DENSITY_MAX, step: 10 };

export function setTile(tile: number) {
  const clamped = Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, tile));
  ui.set({ tile: clamped });
  try {
    localStorage.setItem(TILE_KEY, String(clamped));
  } catch {
    // Ignore storage failures.
  }
}

export function navigate(next: Partial<Pick<UiState, "view" | "focusedId">>) {
  const current = ui.get();
  const view = next.view ?? current.view;
  const focusedId = next.focusedId === undefined ? current.focusedId : next.focusedId;
  const hash = focusedId ? `#device/${encodeURIComponent(focusedId)}` : view === "devices" ? "#" : `#${view}`;
  if (location.hash !== hash) history.pushState(null, "", hash === "#" ? location.pathname : hash);
  ui.set({ view, focusedId });
}

window.addEventListener("popstate", () => ui.set(fromHash()));
window.addEventListener("hashchange", () => ui.set(fromHash()));

let hiddenTimer = 0;
document.addEventListener("visibilitychange", () => {
  clearTimeout(hiddenTimer);
  if (document.hidden) {
    hiddenTimer = window.setTimeout(() => ui.set({ hidden: true }), 8000);
  } else {
    ui.set({ hidden: false });
  }
});
