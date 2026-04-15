import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Clock,
  Timer,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { ToolCallInfo } from "./types";

export type { ToolCallInfo };

// ── Time formatting helpers ─────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

// ── Live elapsed hook ────────────────────────────────────────────────

/**
 * Returns the elapsed time in ms between `start` and `end` (or now).
 * Re-renders every second while `active` is true to keep the display ticking.
 */
function useLiveElapsed(
  start: Date | undefined,
  end: Date | undefined,
  active: boolean,
): number | undefined {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active || !start) return;

    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active, start]);

  if (!start) return undefined;
  const endTime = end ?? now;
  return endTime.getTime() - start.getTime();
}

// ── Component ────────────────────────────────────────────────────────

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
  /** Message-level timestamp (wall-clock time the message was created). */
  timestamp?: Date;
}

export function ToolCallDisplay({ toolCall, timestamp }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const isDone =
    toolCall.status === "completed" || toolCall.status === "failed";

  const isActive = !isDone && !!toolCall.startedAt;

  const elapsed = useLiveElapsed(
    toolCall.startedAt,
    toolCall.completedAt,
    isActive,
  );

  const statusIcon = {
    pending: (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    ),
    in_progress: <Loader2 className="size-3.5 animate-spin text-blue-500" />,
    completed: <CheckCircle2 className="size-3.5 text-green-500" />,
    failed: <XCircle className="size-3.5 text-red-500" />,
  }[toolCall.status];

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{toolCall.name}</span>
        {statusIcon}

        {/* Right-aligned timing info */}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground/60">
          {/* Elapsed duration */}
          {elapsed != null && (
            <span className="flex items-center gap-1">
              <Timer className="size-2.5" />
              {formatElapsed(elapsed)}
            </span>
          )}

          {/* Wall-clock timestamp from message */}
          {timestamp && (
            <span className="flex items-center gap-1">
              <Clock className="size-2.5" />
              {formatTimestamp(timestamp)}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {toolCall.arguments && (
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Arguments:
              </span>
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                {toolCall.arguments}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Output:
              </span>
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
