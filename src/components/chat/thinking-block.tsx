import { ChevronDown, ChevronRight, Brain, Loader2, Clock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { renderMarkdown } from "./markdown";

// ── Time formatting ──────────────────────────────────────────────────

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

interface ThinkingBlockProps {
  /** The accumulated thinking content */
  content: string;
  /** Whether the model is still streaming thoughts */
  isStreaming?: boolean;
  /** When thinking started */
  startedAt?: Date;
  /** When thinking completed */
  completedAt?: Date;
}

export function ThinkingBlock({
  content,
  isStreaming = false,
  startedAt,
  completedAt,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isActive = isStreaming && !!startedAt && !completedAt;

  const elapsed = useLiveElapsed(startedAt, completedAt, isActive);

  // Synchronize expanded state with streaming transitions during render.
  // This is the recommended React pattern for "adjusting state when a prop changes"
  // — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (isStreaming !== prevIsStreaming) {
    setPrevIsStreaming(isStreaming);
    if (isStreaming) {
      // Streaming just started — auto-expand so the user can watch
      setExpanded(true);
    } else if (content.length > 0) {
      // Streaming just finished — auto-collapse to keep the UI tidy
      setExpanded(false);
    }
  }

  // Auto-scroll to bottom while streaming and expanded
  useEffect(() => {
    if (isStreaming && expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  // Don't render anything if there's no thinking content
  if (!content) return null;

  return (
    <div className="my-1 rounded-lg border border-border/60 bg-muted/30">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}

        <Brain className="size-3.5 shrink-0 text-muted-foreground/70" />

        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span className="italic">Thinking…</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Thoughts</span>
        )}
        {elapsed != null && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Clock className="size-2.5" />
            {formatElapsed(elapsed)}
          </span>
        )}
      </button>

      {/* Content — collapsible */}
      {expanded && (
        <div className="border-t border-border/40">
          <div ref={scrollRef} className="max-h-75 overflow-y-auto px-3 py-2">
            <div className="wrap-break-word text-[13px] leading-relaxed text-muted-foreground/80">
              {renderMarkdown(content)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
