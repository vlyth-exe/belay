import { useState, useCallback } from "react";
import { Pencil, Copy, Check } from "lucide-react";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallDisplay } from "./tool-call-display";
import { renderMarkdown } from "./markdown";
import type { Message, MessageBlock, ToolCallInfo } from "./types";

export type { Message, MessageBlock, ToolCallInfo };

// ── Block renderer ────────────────────────────────────────────────────

function BlockRenderer({
  block,
  isStreaming,
}: {
  block: MessageBlock;
  isStreaming?: boolean;
}) {
  switch (block.type) {
    case "thinking":
      return (
        <ThinkingBlock content={block.content} isStreaming={isStreaming} />
      );

    case "text":
      if (!block.content) return null;
      return (
        <div className="wrap-break-word text-[14px] leading-relaxed">
          {renderMarkdown(block.content)}
        </div>
      );

    case "tool_call":
      return <ToolCallDisplay toolCall={block.toolCall} />;
  }
}

// ── MessageBubble ─────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  /** Called when the user clicks "edit" on a user message. */
  onEdit?: (messageId: string) => void;
}

export function MessageBubble({ message, onEdit }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Copy message text to clipboard ────────────────────────────────
  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const textBlock = message.blocks.find((b) => b.type === "text");
      const content = textBlock?.type === "text" ? textBlock.content : "";
      if (!content) return;
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback — ignore
      }
    },
    [message.blocks],
  );

  // ── Edit handler ──────────────────────────────────────────────────
  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(message.id);
    },
    [message.id, onEdit],
  );

  // ── User messages: terminal-style input with hover actions ──────
  if (isUser) {
    const textBlock = message.blocks.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.content : "";
    const showActions = isHovered && !message.isStreaming;

    return (
      <div
        className="group/msg flex items-end justify-end gap-1.5"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* ── Action buttons (left of bubble) ──────────────────────── */}
        <div
          className={[
            "flex shrink-0 items-center gap-0.5 pb-1 transition-opacity duration-150",
            showActions ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        >
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Copy message"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>

          {/* Edit / Resend */}
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Edit and resend"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>

        {/* ── Bubble ───────────────────────────────────────────────── */}
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-[14px] leading-relaxed text-primary-foreground">
          <p className="whitespace-pre-wrap wrap-break-word">{content}</p>
        </div>
      </div>
    );
  }

  // ── Assistant messages: full-width block output ──────────────────
  const hasContent = message.blocks.some(
    (b) =>
      (b.type === "thinking" && b.content.length > 0) ||
      (b.type === "text" && b.content.length > 0) ||
      b.type === "tool_call",
  );

  if (!hasContent) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:0ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:150ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:300ms]" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-2">
        {message.blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            isStreaming={
              message.isStreaming &&
              block.id === message.blocks[message.blocks.length - 1]?.id
            }
          />
        ))}
      </div>
    </div>
  );
}
