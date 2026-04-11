import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Sparkles } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { PermissionDialog } from "./permission-dialog";
import type { Message, MessageBlock, ToolCallInfo } from "./types";

import {
  useConnectionState,
  useAcpActions,
  useAcpUpdates,
} from "@/hooks/use-acp";

// ── Block helpers ────────────────────────────────────────────────────

/** Extract text output from an ACP ToolCallContent array. */
function extractToolCallOutput(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content as Array<Record<string, unknown>>) {
    if (item.type === "content") {
      const block = item.content as Record<string, unknown> | undefined;
      if (block?.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Append text to the last block if it matches the given type,
 * otherwise create a new block of that type.
 *
 * This produces the sequential block pattern:
 *   think → think (appended) → say → say (appended) → tool → think → …
 */
function appendOrCreateBlock(
  blocks: MessageBlock[],
  type: "thinking" | "text",
  text: string,
): MessageBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.type === type) {
    return [...blocks.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...blocks, { id: crypto.randomUUID(), type, content: text }];
}

/** Insert or update a tool_call block matched by toolCallId. */
function upsertToolCallBlock(
  blocks: MessageBlock[],
  update: Partial<ToolCallInfo> & { id: string },
): MessageBlock[] {
  const idx = blocks.findIndex(
    (b) => b.type === "tool_call" && b.toolCall.id === update.id,
  );

  if (idx >= 0) {
    const block = blocks[idx];
    if (block.type === "tool_call") {
      return [
        ...blocks.slice(0, idx),
        { ...block, toolCall: { ...block.toolCall, ...update } },
        ...blocks.slice(idx + 1),
      ];
    }
  }

  // New tool call — append as a new block
  return [
    ...blocks,
    {
      id: crypto.randomUUID(),
      type: "tool_call" as const,
      toolCall: {
        name: "unknown",
        status: "pending" as const,
        ...update,
      },
    },
  ];
}

// ── Mock AI response (fallback when no agent connected) ────────────

async function getAIResponse(userMessage: string): Promise<string> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

  const lower = userMessage.toLowerCase();

  if (
    lower.includes("hello") ||
    lower.includes("hi") ||
    lower.includes("hey")
  ) {
    return "Hey there! 👋 How can I help you today?";
  }

  if (lower.includes("help")) {
    return "I'm here to assist you! You can ask me questions about programming, brainstorm ideas, draft text, analyze data, or just have a conversation. What would you like to do?";
  }

  if (lower.includes("thank")) {
    return "You're welcome! Let me know if there's anything else I can help with.";
  }

  const responses = [
    "That's a great question. Let me think about that...\n\nBased on what you've described, I'd suggest breaking the problem down into smaller steps. Start with the core requirement and iterate from there.",
    "I'd be happy to help with that! Here's my take:\n\nThe key thing to consider is the overall architecture. Once you have a solid foundation, the details tend to fall into place more naturally.",
    "Interesting point! There are a few ways to approach this:\n\n1. **The straightforward approach** — just get it working first\n2. **The elegant approach** — design for extensibility\n3. **The pragmatic approach** — a bit of both\n\nI'd usually recommend option 3 for most cases.",
    "Let me work through that with you.\n\nThe main thing to keep in mind is that simplicity wins. Don't over-engineer early on — you can always refine later once you understand the problem space better.",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// ── Suggested prompts for empty state ──────────────────────────────

const suggestions = [
  "Explain how closures work in JavaScript",
  "Help me design a REST API",
  "Write a function that validates emails",
  "What are the best practices for React state management?",
];

// ── Chat Component ─────────────────────────────────────────────────

interface ChatProps {
  projectPath?: string;
}

export function Chat({ projectPath }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ACP state
  const connectionState = useConnectionState();
  const { sendPrompt, cancelPrompt, createSession } = useAcpActions();
  const { updates, clearUpdates } = useAcpUpdates();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<{
    requestId: string;
    sessionId: string;
    description: string;
    options: Array<{ id: string; label: string; kind: string }>;
  } | null>(null);

  // Track which updates have been processed for streaming
  const processedUpdateIndex = useRef(0);
  // The ID of the assistant message currently being streamed into
  const streamingMessageId = useRef<string | null>(null);

  // ── Reset session when connection drops ──────────────────────────
  useEffect(() => {
    if (connectionState === "disconnected") {
      setSessionId(null);
    }
  }, [connectionState]);

  // ── Listen for permission requests ───────────────────────────────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubscribe = api.acpOnPermissionRequest?.((request: unknown) => {
      setPermissionRequest(request as typeof permissionRequest);
    });
    return () => {
      void unsubscribe;
    };
  }, []);

  // ── Process streaming updates into sequential blocks ─────────────
  useEffect(() => {
    const newUpdates = updates.slice(processedUpdateIndex.current);
    processedUpdateIndex.current = updates.length;

    if (newUpdates.length === 0) return;

    for (const raw of newUpdates) {
      // ACP sends SessionNotification: { sessionId, update: SessionUpdate }
      const notification = raw as Record<string, unknown>;
      const inner = notification.update as Record<string, unknown> | undefined;
      if (!inner) continue;

      const sessionUpdate = inner.sessionUpdate as string | undefined;
      const targetId = streamingMessageId.current;
      if (!targetId) continue;

      // ── Thought chunk ──────────────────────────────────────────
      // ContentChunk: { sessionUpdate: "agent_thought_chunk", content: ContentBlock }
      if (sessionUpdate === "agent_thought_chunk") {
        const contentBlock = inner.content as
          | Record<string, unknown>
          | undefined;
        const text =
          contentBlock?.type === "text"
            ? (contentBlock.text as string)
            : undefined;
        if (text) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === targetId
                ? {
                    ...msg,
                    blocks: appendOrCreateBlock(msg.blocks, "thinking", text),
                  }
                : msg,
            ),
          );
        }
      }

      // ── Message chunk (text) ───────────────────────────────────
      // ContentChunk: { sessionUpdate: "agent_message_chunk", content: ContentBlock }
      if (sessionUpdate === "agent_message_chunk") {
        const contentBlock = inner.content as
          | Record<string, unknown>
          | undefined;
        const text =
          contentBlock?.type === "text"
            ? (contentBlock.text as string)
            : undefined;
        if (text) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === targetId
                ? {
                    ...msg,
                    blocks: appendOrCreateBlock(msg.blocks, "text", text),
                  }
                : msg,
            ),
          );
        }
      }

      // ── Tool call (new) ────────────────────────────────────────
      // ToolCall: { sessionUpdate: "tool_call", toolCallId, title, status, rawInput, content }
      if (sessionUpdate === "tool_call") {
        const toolCall: Partial<ToolCallInfo> & { id: string } = {
          id: (inner.toolCallId as string) ?? "",
          name: (inner.title as string) ?? "unknown",
          status: (inner.status as ToolCallInfo["status"]) ?? "pending",
          arguments:
            inner.rawInput != null
              ? JSON.stringify(inner.rawInput, null, 2)
              : undefined,
          output: extractToolCallOutput(inner.content),
        };

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === targetId
              ? { ...msg, blocks: upsertToolCallBlock(msg.blocks, toolCall) }
              : msg,
          ),
        );
      }

      // ── Tool call update ───────────────────────────────────────
      // ToolCallUpdate: { sessionUpdate: "tool_call_update", toolCallId, status?, title?, content? }
      if (sessionUpdate === "tool_call_update") {
        const update: Partial<ToolCallInfo> & { id: string } = {
          id: (inner.toolCallId as string) ?? "",
          ...(inner.status != null
            ? { status: inner.status as ToolCallInfo["status"] }
            : {}),
          ...(inner.title != null ? { name: inner.title as string } : {}),
          ...(inner.rawInput != null
            ? { arguments: JSON.stringify(inner.rawInput, null, 2) }
            : {}),
          ...(inner.content != null
            ? { output: extractToolCallOutput(inner.content) }
            : {}),
        };

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === targetId
              ? { ...msg, blocks: upsertToolCallBlock(msg.blocks, update) }
              : msg,
          ),
        );
      }
    }
  }, [updates]);

  // ── Auto-scroll to bottom on new messages ────────────────────────
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, scrollToBottom]);

  // ── Permission response handler ──────────────────────────────────
  const handlePermissionRespond = useCallback(
    (requestId: string, optionId: string) => {
      window.electronAPI?.acpRespondPermission(requestId, optionId);
      setPermissionRequest(null);
    },
    [],
  );

  // ── Send a message ───────────────────────────────────────────────
  const handleSend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isThinking) return;

      // User message — single text block
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        blocks: [{ id: crypto.randomUUID(), type: "text", content: trimmed }],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const isConnected = connectionState === "ready";

      if (isConnected) {
        // ── ACP path: use real agent ───────────────────────────────
        setIsThinking(true);
        clearUpdates();
        processedUpdateIndex.current = 0;

        try {
          // Create session if we don't have one
          let sid = sessionId;
          if (!sid) {
            const result = await createSession(projectPath);
            sid =
              typeof result === "string"
                ? result
                : ((result as { sessionId?: string } | undefined)?.sessionId ??
                  null);
            setSessionId(sid);
          }

          if (!sid) throw new Error("Failed to create session");

          // Create an empty streaming assistant message — blocks will be
          // appended sequentially by the update processor above.
          const assistantId = crypto.randomUUID();
          streamingMessageId.current = assistantId;
          const assistantMessage: Message = {
            id: assistantId,
            role: "assistant",
            blocks: [],
            timestamp: new Date(),
            isStreaming: true,
          };
          setMessages((prev) => [...prev, assistantMessage]);

          // Send prompt (resolves when agent finishes)
          await sendPrompt(sid, trimmed);

          // Mark the message as no longer streaming
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, isStreaming: false } : msg,
            ),
          );
        } catch {
          // On error, finalize the streaming message with an error note
          if (streamingMessageId.current) {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== streamingMessageId.current) return msg;
                const hasText = msg.blocks.some(
                  (b) => b.type === "text" && b.content.length > 0,
                );
                return {
                  ...msg,
                  isStreaming: false,
                  blocks: hasText
                    ? msg.blocks
                    : [
                        ...msg.blocks,
                        {
                          id: crypto.randomUUID(),
                          type: "text" as const,
                          content:
                            "Sorry, something went wrong while communicating with the agent.",
                        },
                      ],
                };
              }),
            );
          }
        } finally {
          setIsThinking(false);
          streamingMessageId.current = null;
        }
      } else {
        // ── Fallback path: mock AI response ────────────────────────
        setIsThinking(true);
        try {
          const response = await getAIResponse(trimmed);
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            blocks: [
              { id: crypto.randomUUID(), type: "text", content: response },
            ],
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } catch {
          const errorMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            blocks: [
              {
                id: crypto.randomUUID(),
                type: "text",
                content: "Sorry, something went wrong. Please try again.",
              },
            ],
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        } finally {
          setIsThinking(false);
        }
      }
    },
    [
      isThinking,
      connectionState,
      sessionId,
      createSession,
      sendPrompt,
      clearUpdates,
      projectPath,
    ],
  );

  // ── Cancel an in-progress prompt ─────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (sessionId) {
      try {
        await cancelPrompt(sessionId);
      } catch {
        // Ignore cancel errors
      }
    }
    if (streamingMessageId.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageId.current
            ? { ...msg, isStreaming: false }
            : msg,
        ),
      );
    }
    setIsThinking(false);
    streamingMessageId.current = null;
  }, [sessionId, cancelPrompt]);

  // ── Empty state ──────────────────────────────────────────────────
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-7 text-primary" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              How can I help you?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {connectionState === "ready"
                ? "Connected to an agent. Ask me anything!"
                : "Ask me anything — code, ideas, writing, analysis, and more."}
            </p>
          </div>

          <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSend(suggestion)}
                className="rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <ChatInput onSend={handleSend} disabled={isThinking} />

        {/* Dialogs */}
        <PermissionDialog
          request={permissionRequest}
          onRespond={handlePermissionRespond}
        />
      </div>
    );
  }

  // ── Conversation view ────────────────────────────────────────────
  const isStreaming = messages.some((m) => m.isStreaming);

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="space-y-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Typing indicator (only when not streaming via ACP) */}
            {isThinking && !isStreaming && (
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {/* Cancel button during ACP streaming */}
            {isThinking && isStreaming && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input pinned to bottom */}
      <ChatInput onSend={handleSend} disabled={isThinking} />

      {/* Dialogs */}
      <PermissionDialog
        request={permissionRequest}
        onRespond={handlePermissionRespond}
      />
    </div>
  );
}
