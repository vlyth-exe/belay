import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type { ToolCallInfo } from "./types";

export type { ToolCallInfo };

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

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
