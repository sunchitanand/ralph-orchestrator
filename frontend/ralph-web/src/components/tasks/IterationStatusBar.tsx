import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Hash } from "lucide-react";

export interface IterationStatusBarProps {
  iteration: number;
  maxIterations: number | null;
  hatName: string | null;
  startedAt: string | null;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function IterationStatusBar({
  iteration,
  maxIterations,
  hatName,
  startedAt,
}: IterationStatusBarProps) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Date.now() - new Date(startedAt).getTime() : 0
  );

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Date.now() - new Date(startedAt).getTime());
    const id = setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const pct = maxIterations ? Math.round((iteration / maxIterations) * 100) : 0;

  return (
    <div
      data-testid="iteration-status-bar"
      className="flex items-center gap-4 rounded-lg border bg-muted/40 px-4 py-2 text-sm"
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Hash className="h-3.5 w-3.5" />
        {maxIterations
          ? `Iteration ${iteration} / ${maxIterations}`
          : `Iteration ${iteration}`}
      </span>

      {hatName && (
        <Badge variant="secondary" data-testid="hat-badge">
          {hatName}
        </Badge>
      )}

      {maxIterations && (
        <div
          role="progressbar"
          aria-valuenow={iteration}
          aria-valuemax={maxIterations}
          className="h-2 flex-1 rounded-full bg-muted overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {startedAt && (
        <span
          data-testid="elapsed-time"
          className="flex items-center gap-1.5 tabular-nums text-muted-foreground"
        >
          <Clock className="h-3.5 w-3.5" />
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}
