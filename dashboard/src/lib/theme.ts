import { createStore } from "./store";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "simfleet.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage may be blocked.
  }
  return "system";
}

export const theme = createStore<{ preference: ThemePreference; dark: boolean }>({
  preference: stored(),
  dark: stored() === "dark" || (stored() === "system" && media.matches),
});

function apply(first = false) {
  const { preference } = theme.get();
  const dark = preference === "dark" || (preference === "system" && media.matches);
  const root = document.documentElement;
  if (!first) {
    // Snap the switch: transitions on every element would smear otherwise.
    root.classList.add("theme-switching");
    void root.offsetHeight;
  }
  root.classList.toggle("dark", dark);
  theme.set({ dark });
  if (!first) requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

export function setTheme(preference: ThemePreference) {
  theme.set({ preference });
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // Ignore storage failures.
  }
  apply();
}

export function cycleTheme() {
  const order: ThemePreference[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(theme.get().preference) + 1) % order.length];
  setTheme(next);
  return next;
}

media.addEventListener("change", () => apply());
apply(true);
