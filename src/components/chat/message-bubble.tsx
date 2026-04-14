import { useState, useCallback, useRef, useEffect } from "react";
import {
  Pencil,
  Copy,
  Check,
  X,
  ArrowUp,
  GitBranch,
  Shield,
  CheckCheck,
} from "lucide-react";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallDisplay } from "./tool-call-display";
import { Button } from "@/components/ui/button";
import { renderMarkdown } from "./markdown";
import type {
  Message,
  MessageBlock,
  ToolCallInfo,
  PermissionRequestInfo,
} from "./types";

export type { Message, MessageBlock, ToolCallInfo };

// ── Permission block renderer ─────────────────────────────────────────

function PermissionBlockRenderer({
  permission,
  onRespond,
}: {
  permission: PermissionRequestInfo;
  onRespond: (requestId: string, optionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Shield className="size-3.5 shrink-0 text-amber-600" />
        <span className="text-[13px] font-medium">
          {permission.toolCall?.title ?? "Permission Request"}
        </span>
      </div>

      {/* Reason */}
      {permission.reason && (
        <div className="border-t border-amber-500/15 px-3 py-2">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {permission.reason}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-1.5 border-t border-amber-500/15 px-3 py-2">
        {permission.options.map((option) => {
          const isReject = option.kind.startsWith("reject");
          const isAlways = option.kind === "allow_always";
          const Icon = isAlways ? CheckCheck : isReject ? X : Check;
          return (
            <Button
              key={option.id}
              variant={isReject ? "outline" : "default"}
              size="xs"
              onClick={() => onRespond(permission.requestId, option.id)}
            >
              <Icon className="size-3" />
              {option.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ── Block renderer ────────────────────────────────────────────────────

function BlockRenderer({
  block,
  isStreaming,
  onPermissionRespond,
}: {
  block: MessageBlock;
  isStreaming?: boolean;
  onPermissionRespond?: (requestId: string, optionId: string) => void;
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

    case "permission_request":
      if (!onPermissionRespond) return null;
      return (
        <PermissionBlockRenderer
          permission={block.permission}
          onRespond={onPermissionRespond}
        />
      );
  }
}

// ── MessageBubble ─────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  /** Called when the user clicks "edit" on a user message. */
  onEdit?: (messageId: string) => void;
  /** Called when the user clicks "branch" to create a new session from this message. */
  onBranch?: (messageId: string) => void;
  /** Whether this message is currently being edited inline. */
  isEditing?: boolean;
  /** Called when the user submits an inline edit (Enter or Send button). */
  onEditSubmit?: (messageId: string, newContent: string) => void;
  /** Called when the user cancels an inline edit (Escape or Cancel button). */
  onEditCancel?: () => void;
  /** Called when the user responds to a permission request. */
  onPermissionRespond?: (requestId: string, optionId: string) => void;
}

export function MessageBubble({
  message,
  onEdit,
  onBranch,
  isEditing = false,
  onEditSubmit,
  onEditCancel,
  onPermissionRespond,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [prevIsEditing, setPrevIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When entering edit mode, initialise the draft from the message content.
  // React-recommended pattern: adjust state during render when a prop changes.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (isEditing !== prevIsEditing) {
    setPrevIsEditing(isEditing);
    if (isEditing) {
      const textBlock = message.blocks.find((b) => b.type === "text");
      const content = textBlock?.type === "text" ? textBlock.content : "";
      setEditDraft(content);
    }
  }

  // Auto-focus & auto-resize when editing starts
  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [isEditing]);

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

  // ── Edit handlers ─────────────────────────────────────────────────
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(message.id);
    },
    [message.id, onEdit],
  );

  // ── Branch handler ────────────────────────────────────────────────
  const handleBranch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBranch?.(message.id);
    },
    [message.id, onBranch],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = editDraft.trim();
        if (trimmed) {
          onEditSubmit?.(message.id, trimmed);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEditCancel?.();
      }
    },
    [editDraft, message.id, onEditSubmit, onEditCancel],
  );

  const handleEditChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditDraft(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    [],
  );

  const handleSubmitClick = useCallback(() => {
    const trimmed = editDraft.trim();
    if (trimmed) {
      onEditSubmit?.(message.id, trimmed);
    }
  }, [editDraft, message.id, onEditSubmit]);

  const handleCancelClick = useCallback(() => {
    onEditCancel?.();
  }, [onEditCancel]);

  // ── User messages: terminal-style input with hover actions ──────
  if (isUser) {
    const textBlock = message.blocks.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.content : "";
    const showActions = isHovered && !message.isStreaming && !isEditing;

    // ── Editing mode: textarea inside the bubble ─────────────────
    if (isEditing) {
      return (
        <div
          className="group/msg flex items-end justify-end gap-1.5"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* ── Bubble with textarea ──────────────────────────────── */}
          <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-[14px] leading-relaxed text-primary-foreground">
            <textarea
              ref={textareaRef}
              value={editDraft}
              onChange={handleEditChange}
              onKeyDown={handleEditKeyDown}
              rows={1}
              className="w-full resize-none rounded bg-transparent text-[14px] leading-relaxed text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none"
              style={{ maxHeight: 200 }}
            />
            {/* ── Edit action buttons ─────────────────────────────── */}
            <div className="mt-1 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={handleCancelClick}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                aria-label="Cancel edit"
              >
                <X className="size-3" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitClick}
                disabled={!editDraft.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/20 px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/30 disabled:opacity-40 disabled:hover:bg-primary-foreground/20"
                aria-label="Send edited message"
              >
                <ArrowUp className="size-3" strokeWidth={2.5} />
                Send
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ── Normal (non-editing) user bubble ─────────────────────────
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

          {/* Branch from here */}
          {onBranch && (
            <button
              type="button"
              onClick={handleBranch}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Branch from here"
            >
              <GitBranch className="size-3.5" />
            </button>
          )}

          {/* Edit / Resend */}
          {onEdit && (
            <button
              type="button"
              onClick={handleEditClick}
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
            onPermissionRespond={onPermissionRespond}
          />
        ))}
      </div>
    </div>
  );
}
