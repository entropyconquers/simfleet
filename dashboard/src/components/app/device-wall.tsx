import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { MonitorOffIcon, SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { announce } from "@/lib/announce";
import { matchesFilters } from "@/lib/devices";
import { fleet } from "@/lib/fleet-store";
import { navigate, ui } from "@/lib/ui-store";
import { DeviceTile } from "./device-tile";

export function DeviceWall() {
  const devices = fleet.use((state) => state.devices);
  const settled = fleet.use((state) => state.settled);
  const status = fleet.use((state) => state.status);
  const platform = ui.use((state) => state.platform);
  const stateFilter = ui.use((state) => state.state);
  const query = ui.use((state) => state.query);
  const tile = ui.use((state) => state.tile);
  const hidden = ui.use((state) => state.hidden);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(
    () => devices.filter((device) => matchesFilters(device, platform, stateFilter, query)),
    [devices, platform, stateFilter, query],
  );
  const serviceUp = status?.simulatorControl.running ?? true;

  // Announce result counts once they settle, not on every poll.
  const lastAnnounced = useRef<string>("");
  useEffect(() => {
    if (!settled) return;
    const message = `Showing ${shown.length} of ${devices.length} devices`;
    if (message === lastAnnounced.current) return;
    lastAnnounced.current = message;
    const timer = setTimeout(() => announce(message), 400);
    return () => clearTimeout(timer);
  }, [shown.length, devices.length, settled]);

  // Arrow keys move between tiles; Home/End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = event.target as HTMLElement;
    const article = target.closest("article");
    if (!article || target !== article) return;
    const articles = Array.from(listRef.current?.querySelectorAll<HTMLElement>("article") ?? []);
    const index = articles.indexOf(article);
    if (index < 0) return;
    const columns = Math.max(1, Math.floor((listRef.current?.clientWidth ?? 0) / (tile + 12)));
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    let next: number | undefined;
    if (event.key in moves) next = index + moves[event.key];
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = articles.length - 1;
    if (next === undefined || next < 0 || next >= articles.length) return;
    event.preventDefault();
    articles[next].focus();
    articles[next].scrollIntoView({ block: "nearest" });
  };

  if (!settled || (!status && devices.length === 0)) {
    return (
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}
        aria-label="Loading devices"
        aria-busy
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index} className="overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--edge)]">
            <Skeleton className="aspect-[1/2] w-full rounded-none rounded-t-xl" />
            <div className="space-y-2 p-2.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<MonitorOffIcon className="size-6" strokeWidth={1.5} aria-hidden />}
        title="No devices yet"
        body="Create an iOS simulator in Xcode or an Android AVD in Android Studio and it will appear here on the next poll."
      />
    );
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        icon={<SearchXIcon className="size-6" strokeWidth={1.5} aria-hidden />}
        title="No devices match"
        body={`${devices.length} devices are hidden by the current filters.`}
        action={
          <Button
            variant="outline"
            size="sm"
            className="press"
            onClick={() => ui.set({ platform: "all", state: "all", query: "" })}
          >
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <>
    <h1 className="sr-only">Devices</h1>
    <ul
      ref={listRef}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}
      aria-label={`Devices, ${shown.length} shown`}
      onKeyDown={onKeyDown}
    >
      {shown.map((device) => (
        <DeviceTile
          key={`${device.platform}:${device.id}`}
          device={device}
          serviceUp={serviceUp}
          hidden={hidden}
          onOpen={(id) => navigate({ view: "devices", focusedId: id })}
        />
      ))}
    </ul>
    </>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
