import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentsView } from "@/components/app/agents-view";
import { CommandBar } from "@/components/app/command-bar";
import { DeviceWall } from "@/components/app/device-wall";
import { FilterRail } from "@/components/app/filter-rail";
import { FocusView } from "@/components/app/focus-view";
import { HostView } from "@/components/app/host-view";
import { ShortcutsDialog } from "@/components/app/shortcuts-dialog";
import { StartLaneDialog } from "@/components/app/start-lane-dialog";
import { OfflineScreen, StatusBanner } from "@/components/app/status-banner";
import { announcer } from "@/lib/announce";
import { fleet } from "@/lib/fleet-store";
import { cycleTheme, theme } from "@/lib/theme";
import { DENSITY, navigate, setTile, ui } from "@/lib/ui-store";
import { toast } from "sonner";

function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));
      const state = ui.get();
      if (event.key === "Escape") {
        if (state.helpOpen || state.laneDialog.open) return; // Dialogs handle their own Escape.
        if (target?.closest("[data-controlling]")) return; // The screen releases control first.
        if (typing) {
          (target as HTMLElement).blur();
          return;
        }
        if (state.focusedId) {
          event.preventDefault();
          navigate({ focusedId: null });
        }
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("[data-controlling]")) return;
      switch (event.key) {
        case "1":
          navigate({ view: "devices", focusedId: null });
          break;
        case "2":
          navigate({ view: "agents", focusedId: null });
          break;
        case "3":
          navigate({ view: "host", focusedId: null });
          break;
        case "/": {
          const search = document.querySelector<HTMLInputElement>("input[data-search]");
          if (!search) {
            navigate({ view: "devices", focusedId: null });
            requestAnimationFrame(() => document.querySelector<HTMLInputElement>("input[data-search]")?.focus());
          } else {
            search.focus();
            search.select();
          }
          break;
        }
        case "n":
          ui.set({ laneDialog: { open: true, deviceId: state.focusedId ?? undefined } });
          break;
        case "t": {
          const next = cycleTheme();
          toast(`Theme: ${next}`, { duration: 1500 });
          break;
        }
        case "?":
          ui.set({ helpOpen: true });
          break;
        case "[":
          setTile(state.tile - DENSITY.step * 2);
          break;
        case "]":
          setTile(state.tile + DENSITY.step * 2);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

function LiveRegion() {
  const message = announcer.use((state) => state.message);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export default function App() {
  useShortcuts();
  const view = ui.use((state) => state.view);
  const focusedId = ui.use((state) => state.focusedId);
  const settled = fleet.use((state) => state.settled);
  const status = fleet.use((state) => state.status);
  const offline = fleet.use((state) => state.offline);
  const dark = theme.use((state) => state.dark);

  const neverLoaded = settled && !status && offline;

  return (
    <TooltipProvider delayDuration={300}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex h-dvh flex-col">
        <CommandBar />
        <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 outline-none sm:px-4">
          <StatusBanner />
          {neverLoaded ? (
            <OfflineScreen />
          ) : focusedId ? (
            <FocusView deviceId={focusedId} />
          ) : view === "agents" ? (
            <AgentsView />
          ) : view === "host" ? (
            <HostView />
          ) : (
            <>
              <FilterRail />
              <DeviceWall />
            </>
          )}
        </main>
      </div>
      <StartLaneDialog />
      <ShortcutsDialog />
      <LiveRegion />
      <Toaster theme={dark ? "dark" : "light"} position="bottom-right" closeButton richColors={false} />
    </TooltipProvider>
  );
}
