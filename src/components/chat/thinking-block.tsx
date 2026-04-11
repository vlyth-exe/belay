import { ChevronDown, ChevronRight, Brain, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ThinkingBlockProps {
  /** The accumulated thinking content */
  content: string;
  /** Whether the model is still streaming thoughts */
  isStreaming?: boolean;
}

export function ThinkingBlock({
  content,
  isStreaming = false,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Synchronize expanded state with streaming transitions during render.
  // This is the recommended React pattern for "adjusting state when a prop changes"
  // — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
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
      </button>

      {/* Content — collapsible */}
      {expanded && (
        <div className="border-t border-border/40">
          <div ref={scrollRef} className="max-h-75 overflow-y-auto px-3 py-2">
            <p className="wrap-break-word whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground/80">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
