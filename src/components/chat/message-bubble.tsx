import { Bot, User } from "lucide-react";
import { type ReactNode } from "react";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallDisplay } from "./tool-call-display";
import type { Message, MessageBlock, ToolCallInfo } from "./types";

export type { Message, MessageBlock, ToolCallInfo };

// ── Tiny markdown renderer ────────────────────────────────────────────

/**
 * Very small markdown→React renderer for assistant messages.
 * Handles: fenced code blocks, inline code, bold, and newlines.
 */
function renderMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on fenced code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  let key = 0;
  for (const part of parts) {
    if (part.startsWith("```")) {
      // Fenced code block
      const inner = part.slice(3, -3); // strip opening/closing ```
      const firstNewline = inner.indexOf("\n");
      const code = firstNewline === -1 ? inner : inner.slice(firstNewline + 1);
      nodes.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded-lg bg-black/10 p-3 text-xs"
        >
          <code>{code}</code>
        </pre>,
      );
    } else {
      // Regular text — split into lines and handle inline formatting
      const lines = part.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) nodes.push(<br key={`br-${key}-${i}`} />);
        nodes.push(
          <span key={`ln-${key}-${i}`}>{renderInline(lines[i])}</span>,
        );
      }
    }
    key++;
  }
  return nodes;
}

/** Handle inline code and bold within a single line */
function renderInline(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenise on inline code (`...`) and bold (**...**)
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(line)) !== null) {
    // Text before the match
    if (match.index > last) {
      nodes.push(<span key={idx++}>{line.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      // Inline code
      nodes.push(
        <code key={idx++} className="rounded bg-black/10 px-1.5 py-0.5 text-xs">
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      // Bold
      nodes.push(<strong key={idx++}>{match[2].slice(2, -2)}</strong>);
    }
    last = regex.lastIndex;
  }
  if (last < line.length) {
    nodes.push(<span key={idx++}>{line.slice(last)}</span>);
  }
  return nodes;
}

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
        <div className="break-words text-[14px] leading-relaxed">
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
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // ── User messages: simple text bubble ────────────────────────────
  if (isUser) {
    // Find the first text block for user content
    const textBlock = message.blocks.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.content : "";

    return (
      <div className="flex flex-row-reverse gap-3">
        {/* Avatar */}
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>

        {/* Bubble */}
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{content}</p>
          <span className="mt-1 block text-right text-[11px] opacity-50">
            {message.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    );
  }

  // ── Assistant messages: avatar + sequential blocks ───────────────
  const hasContent = message.blocks.some(
    (b) =>
      (b.type === "thinking" && b.content.length > 0) ||
      (b.type === "text" && b.content.length > 0) ||
      b.type === "tool_call",
  );

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="size-4" />
      </div>

      {/* Blocks rendered sequentially */}
      <div className="min-w-0 max-w-[75%]">
        {hasContent ? (
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
        ) : (
          // Empty streaming message — show typing dots
          <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
            <div className="flex items-center gap-1">
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <span className="mt-1 block text-left text-[11px] opacity-50">
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
