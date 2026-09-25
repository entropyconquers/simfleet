import { useId, useMemo, useRef } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fleet } from "@/lib/fleet-store";
import { DENSITY, setTile, ui } from "@/lib/ui-store";
import type { PlatformFilter, StateFilter } from "@/lib/devices";

export function FilterRail() {
  const devices = fleet.use((state) => state.devices);
  const platform = ui.use((state) => state.platform);
  const stateFilter = ui.use((state) => state.state);
  const query = ui.use((state) => state.query);
  const tile = ui.use((state) => state.tile);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const densityId = useId();

  const counts = useMemo(() => {
    const scoped = devices.filter((device) => platform === "all" || device.platform === platform);
    return {
      ios: devices.filter((device) => device.platform === "ios").length,
      android: devices.filter((device) => device.platform === "android").length,
      running: scoped.filter((device) => device.live).length,
      lane: scoped.filter((device) => device.lane).length,
      agent: scoped.filter((device) => device.agents.length > 0).length,
      all: scoped.length,
    };
  }, [devices, platform]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={platform}
        onValueChange={(value) => value && ui.set({ platform: value as PlatformFilter })}
        aria-label="Platform"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="ios">
          iOS <Count value={counts.ios} />
        </ToggleGroupItem>
        <ToggleGroupItem value="android">
          Android <Count value={counts.android} />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={stateFilter}
        onValueChange={(value) => value && ui.set({ state: value as StateFilter })}
        aria-label="Show"
      >
        <ToggleGroupItem value="all">
          Every device <Count value={counts.all} />
        </ToggleGroupItem>
        <ToggleGroupItem value="running">
          Running <Count value={counts.running} />
        </ToggleGroupItem>
        <ToggleGroupItem value="lane">
          With lane <Count value={counts.lane} />
        </ToggleGroupItem>
        <ToggleGroupItem value="agent">
          With agent <Count value={counts.agent} />
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="relative min-w-44 flex-1 sm:max-w-64">
        <Label htmlFor={searchId} className="sr-only">
          Search devices, branches and agents
        </Label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={searchRef}
          id={searchId}
          data-search
          type="search"
          value={query}
          onChange={(event) => ui.set({ query: event.target.value })}
          placeholder="Search name, branch, agent"
          className="h-7 pl-8 text-[13px]"
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            aria-label="Clear search"
            onClick={() => {
              ui.set({ query: "" });
              searchRef.current?.focus();
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor={densityId} className="text-xs text-muted-foreground">
          Tile size
        </Label>
        <Slider
          id={densityId}
          className="w-28"
          min={DENSITY.min}
          max={DENSITY.max}
          step={DENSITY.step}
          value={[tile]}
          onValueChange={([value]) => setTile(value)}
          aria-label="Tile size"
        />
      </div>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="tabular ml-0.5 text-[11px] text-muted-foreground">{value}</span>;
}
