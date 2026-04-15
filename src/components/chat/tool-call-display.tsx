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
import { useState } from "react";
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

function formatElapsed(start: Date, end?: Date): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}m ${remaining}s`;
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
          {/* Elapsed duration from toolCall timing */}
          {toolCall.startedAt && (
            <span className="flex items-center gap-1">
              <Timer className="size-2.5" />
              {isDone && toolCall.completedAt
                ? formatElapsed(toolCall.startedAt, toolCall.completedAt)
                : formatElapsed(toolCall.startedAt)}
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
