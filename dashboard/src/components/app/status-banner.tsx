import { RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { fleet, refresh } from "@/lib/fleet-store";
import { timeAgo } from "@/lib/format";

/** Offline and error banner. The wall keeps the last payload underneath it. */
export function StatusBanner() {
  const error = fleet.use((state) => state.error);
  const offline = fleet.use((state) => state.offline);
  const fetching = fleet.use((state) => state.fetching);
  const lastUpdatedAt = fleet.use((state) => state.lastUpdatedAt);
  const now = useNow(5000);
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <WifiOffIcon className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{offline ? `Cannot reach the fleet server at ${location.host}.` : "The fleet server returned an error."}</span>
      <span className="text-destructive/80">
        {offline ? "Is `simfleet serve` running?" : error}
        {lastUpdatedAt ? ` Showing data from ${timeAgo(new Date(lastUpdatedAt).toISOString(), now)}.` : ""}
      </span>
      <Button size="xs" variant="outline" className="press ml-auto border-destructive/30" onClick={() => void refresh()} disabled={fetching}>
        <RefreshCwIcon data-icon="inline-start" className={fetching ? "animate-spin" : undefined} />
        Retry now
      </Button>
    </div>
  );
}

export function OfflineScreen() {
  const fetching = fleet.use((state) => state.fetching);
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <WifiOffIcon className="size-5" aria-hidden />
      </span>
      <h1 className="text-base font-semibold">Fleet server unreachable</h1>
      <p className="text-sm text-muted-foreground">
        Nothing answered at <span className="font-mono">{location.host}</span>. Start it with <span className="font-mono">simfleet serve</span> in your project, then retry.
      </p>
      <Button size="sm" className="press" onClick={() => void refresh()} disabled={fetching}>
        <RefreshCwIcon data-icon="inline-start" className={fetching ? "animate-spin" : undefined} />
        Retry
      </Button>
    </div>
  );
}
