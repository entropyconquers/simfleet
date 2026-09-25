import { useEffect, useRef, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Lane } from "@/lib/types";

export function LogDialog({ lane, open, onOpenChange }: { lane: Lane; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Metro log · {lane.branch}</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{lane.logPath}</DialogDescription>
        </DialogHeader>
        {/* Radix unmounts the content when closed, so the body loads fresh on every open. */}
        <LogBody laneId={lane.id} />
      </DialogContent>
    </Dialog>
  );
}

type Result = { text: string } | { error: string } | null;

function LogBody({ laneId }: { laneId: string }) {
  const [result, setResult] = useState<Result>(null);
  const [generation, setGeneration] = useState(0);
  const preRef = useRef<HTMLPreElement>(null);
  const loading = result === null;

  useEffect(() => {
    let cancelled = false;
    api
      .laneLog(laneId)
      .then((text) => {
        if (cancelled) return;
        setResult({ text });
        requestAnimationFrame(() => {
          if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setResult({ error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [laneId, generation]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="press"
          disabled={loading}
          onClick={() => {
            setResult(null);
            setGeneration((current) => current + 1);
          }}
        >
          <RefreshCwIcon data-icon="inline-start" className={loading ? "animate-spin" : undefined} />
          Reload
        </Button>
        <span className="text-xs text-muted-foreground">Last 40,000 characters</span>
      </div>
      {result && "error" in result ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      <pre
        ref={preRef}
        tabIndex={0}
        aria-label="Log output"
        aria-busy={loading}
        className="min-h-40 flex-1 overflow-auto rounded-lg bg-screen p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/85 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        {loading ? "Loading…" : "text" in result ? result.text || "The log is empty." : ""}
      </pre>
    </>
  );
}
