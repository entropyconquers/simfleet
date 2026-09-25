import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ui } from "@/lib/ui-store";

const GROUPS: Array<{ title: string; rows: Array<{ keys: string[]; does: string }> }> = [
  {
    title: "Navigate",
    rows: [
      { keys: ["1"], does: "Devices" },
      { keys: ["2"], does: "Agents" },
      { keys: ["3"], does: "Host" },
      { keys: ["/"], does: "Search devices" },
      { keys: ["n"], does: "Start a lane" },
      { keys: ["t"], does: "Cycle theme (system, light, dark)" },
      { keys: ["?"], does: "This help" },
      { keys: ["Esc"], does: "Close, release, or go back" },
    ],
  },
  {
    title: "Device wall",
    rows: [
      { keys: ["←", "→", "↑", "↓"], does: "Move between tiles" },
      { keys: ["Home", "End"], does: "First or last tile" },
      { keys: ["Enter"], does: "Open the focused device" },
      { keys: ["[", "]"], does: "Smaller or larger tiles" },
    ],
  },
  {
    title: "Focused device",
    rows: [
      { keys: ["←", "→"], does: "Previous or next device" },
      { keys: ["Enter"], does: "Take control of the screen (keys go to the device)" },
      { keys: ["Esc"], does: "Release control, then back to the wall" },
      { keys: ["⌘", "Enter"], does: "Send typed text" },
    ],
  },
];

export function ShortcutsDialog() {
  const open = ui.use((state) => state.helpOpen);
  return (
    <Dialog open={open} onOpenChange={(next) => ui.set({ helpOpen: next })}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Shortcuts are off while you type in a field or control a device screen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title} className={group.title === "Navigate" ? "sm:row-span-2" : undefined}>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{group.title}</h3>
              <dl className="space-y-1.5">
                {group.rows.map((row) => (
                  <div key={row.does} className="flex items-center justify-between gap-3 text-sm">
                    <dt>{row.does}</dt>
                    <dd>
                      <KbdGroup>
                        {row.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
