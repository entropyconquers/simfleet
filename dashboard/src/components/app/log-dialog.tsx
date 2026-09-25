import { useEffect, useRef, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Lane } from "@/lib/types";

export function LogDialog({ lane, open, onOpenChange }: { lane: Lane; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .laneLog(lane.id)
      .then((log) => {
        setText(log);
        requestAnimationFrame(() => {
          if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lane.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Metro log · {lane.branch}</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{lane.logPath}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="press" onClick={load} disabled={loading}>
            <RefreshCwIcon data-icon="inline-start" className={loading ? "animate-spin" : undefined} />
            Reload
          </Button>
          <span className="text-xs text-muted-foreground">Last 40,000 characters</span>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <pre
          ref={preRef}
          tabIndex={0}
          aria-label="Log output"
          className="min-h-40 flex-1 overflow-auto rounded-lg bg-screen p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/85 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          {text === null && !error ? "Loading…" : text || "The log is empty."}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
