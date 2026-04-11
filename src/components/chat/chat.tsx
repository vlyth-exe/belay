import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Sparkles, ChevronDown, Circle, Cpu } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { PermissionDialog } from "./permission-dialog";
import type { Message, MessageBlock, ToolCallInfo } from "./types";

import {
  useConnectionState,
  useAcpActions,
  useSlashCommands,
  useInstalledHarnesses,
} from "@/hooks/use-acp";
import { useSessionMessages } from "@/stores/message-store";
import { useProjectStore } from "@/stores/project-store";

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
  sessionId: string;
  projectId: string;
  projectPath?: string;
}

export function Chat({ sessionId, projectId, projectPath }: ChatProps) {
  // ── Persisted message state ──────────────────────────────────────
  const { messages, setMessages, saveMessages } = useSessionMessages(sessionId);

  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Agent selection ───────────────────────────────────────────────
  const [agentSelectorOpen, setAgentSelectorOpen] = useState(false);
  const agentSelectorRef = useRef<HTMLDivElement>(null);

  // Look up the agentId for this session from the project store
  const { renameSession, setSessionAgent, openProjects } = useProjectStore();
  const agentId =
    openProjects
      .find((p) => p.id === projectId)
      ?.sessions.find((s) => s.id === sessionId)?.agentId ?? null;

  // Agent list for the selector dropdown
  const { harnesses, refresh: refreshHarnesses } = useInstalledHarnesses();

  // ACP state — keyed by the selected agent
  const connectionState = useConnectionState(agentId ?? "");
  const { connect, sendPrompt, cancelPrompt, createSession } = useAcpActions();

  // The ACP session ID (separate from the UI sessionId used for persistence)
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  // Ref mirror so the streaming listener always reads the latest value
  // without waiting for React to re-render and re-register the effect.
  const acpSessionIdRef = useRef<string | null>(null);

  // Slash commands are per-session (filtered by acpSessionId)
  const slashCommands = useSlashCommands(acpSessionId);

  const [permissionRequest, setPermissionRequest] = useState<{
    requestId: string;
    sessionId: string;
    description: string;
    options: Array<{ id: string; label: string; kind: string }>;
  } | null>(null);

  // The ID of the assistant message currently being streamed into
  const streamingMessageId = useRef<string | null>(null);

  // ── Auto-connect to saved agent on mount ─────────────────────────
  useEffect(() => {
    if (!agentId) return;
    connect(agentId).catch((err) =>
      console.error("[Chat] Auto-connect failed:", err),
    );
    refreshHarnesses();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  // ── Close agent selector on outside click ────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        agentSelectorRef.current &&
        !agentSelectorRef.current.contains(e.target as Node)
      ) {
        setAgentSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Agent selection handler ──────────────────────────────────────
  const handleSelectAgent = useCallback(
    async (newAgentId: string) => {
      setAgentSelectorOpen(false);
      if (newAgentId === agentId) return;

      // Persist the selection
      setSessionAgent(projectId, sessionId, newAgentId);

      // Reset ACP session since we're switching agents
      setAcpSessionId(null);
      acpSessionIdRef.current = null;

      // Connect to the new agent
      try {
        await connect(newAgentId);
      } catch (err) {
        console.error("[Chat] Failed to connect to agent:", err);
      }
    },
    [agentId, connect, projectId, sessionId, setSessionAgent],
  );

  // ── Eagerly create ACP session when agent connects ───────────────
  // This triggers the agent to send available_commands_update so slash
  // commands appear before the user sends their first message.
  useEffect(() => {
    if (!agentId) return;
    if (connectionState !== "ready" || acpSessionId) return;
    let cancelled = false;
    createSession(agentId, projectPath).then((result) => {
      if (cancelled) return;
      const sid =
        typeof result === "string"
          ? result
          : ((result as { sessionId?: string } | undefined)?.sessionId ?? null);
      // Use functional updater to avoid overwriting acpSessionId that
      // handleSend may have already set (race condition: both this effect
      // and handleSend can call createSession concurrently).
      if (sid) {
        setAcpSessionId((prev) => prev ?? sid);
        acpSessionIdRef.current = acpSessionIdRef.current ?? sid;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [connectionState, acpSessionId, agentId, createSession, projectPath]);

  // ── Reset ACP session when connection drops ──────────────────────
  useEffect(() => {
    if (connectionState === "disconnected") {
      setAcpSessionId(null);
      acpSessionIdRef.current = null;
    }
  }, [connectionState]);

  // ── Listen for permission requests (filtered by acpSessionId) ────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubscribe = api.acpOnPermissionRequest?.((request: unknown) => {
      if (!request) return;
      const req = request as NonNullable<typeof permissionRequest>;
      // Only show permission UI for OUR session (use ref for same reason as streaming listener)
      const currentAcpSessionId = acpSessionIdRef.current;
      if (!currentAcpSessionId || req.sessionId !== currentAcpSessionId) return;
      setPermissionRequest(req);
    });
    return () => {
      unsubscribe?.();
    };
  }, [acpSessionId]);

  // ── Process streaming updates (filtered by acpSessionId) ─────────
  // Instead of accumulating updates in state and re-iterating in an
  // effect (which can duplicate chunks with multiple listeners),
  // we register ONE listener and process each update immediately
  // using setMessages functional updaters.  We filter by the ACP
  // session ID so only updates for THIS chat are processed.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    return api.acpOnUpdate((raw: unknown) => {
      const notification = raw as Record<string, unknown>;

      // ── Filter: only process updates for our ACP session ───────
      // Use the REF so we always read the latest value, even when
      // handleSend sets acpSessionId and calls sendPrompt before
      // React has re-rendered and re-registered this listener.
      const currentAcpSessionId = acpSessionIdRef.current;
      const notifSessionId = notification.sessionId as string | undefined;
      if (!currentAcpSessionId || notifSessionId !== currentAcpSessionId)
        return;

      const inner = notification.update as Record<string, unknown> | undefined;
      if (!inner) return;

      const sessionUpdate = inner.sessionUpdate as string | undefined;
      const targetId = streamingMessageId.current;
      if (!targetId) return;

      // ── Thought chunk ──────────────────────────────────────────
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
    });
  }, []);

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

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        blocks: [{ id: crypto.randomUUID(), type: "text", content: trimmed }],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Auto-title session from first user message
      if (messages.length === 0) {
        const title =
          trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed;
        renameSession(projectId, sessionId, title);
      }

      const isConnected = agentId && connectionState === "ready";

      if (isConnected && agentId) {
        // ── ACP path: use real agent ───────────────────────────────
        setIsThinking(true);

        try {
          // Reuse existing ACP session or create one if needed
          let sid = acpSessionId;
          if (!sid) {
            const result = await createSession(agentId!, projectPath);
            sid =
              typeof result === "string"
                ? result
                : ((result as { sessionId?: string } | undefined)?.sessionId ??
                  null);
            if (sid) {
              setAcpSessionId(sid);
              acpSessionIdRef.current = sid;
            }
          }

          if (!sid) throw new Error("Failed to create session");

          // Create an empty streaming assistant message — blocks will be
          // appended sequentially by the update listener above.
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
          await sendPrompt(agentId!, sid, trimmed);

          // Mark the message as no longer streaming
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, isStreaming: false } : msg,
            ),
          );

          // Persist completed exchange to disk
          saveMessages();
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
          // Persist even on error so the user's message isn't lost
          saveMessages();
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
          // Persist after mock response
          saveMessages();
        }
      }
    },
    [
      isThinking,
      connectionState,
      acpSessionId,
      agentId,
      createSession,
      sendPrompt,
      projectPath,
      projectId,
      sessionId,
      messages.length,
      renameSession,
      setMessages,
      saveMessages,
    ],
  );

  // ── Cancel an in-progress prompt ─────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (acpSessionId && agentId) {
      try {
        await cancelPrompt(agentId, acpSessionId);
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
    // Persist the cancelled state
    saveMessages();
  }, [acpSessionId, agentId, cancelPrompt, setMessages, saveMessages]);

  // ── Agent selector UI ────────────────────────────────────────────
  const selectedHarness = harnesses.find((h) => h.agentId === agentId);
  const agentStateColor =
    {
      disconnected: "text-muted-foreground",
      initializing: "text-yellow-500",
      ready: "text-green-500",
      error: "text-red-500",
    }[connectionState] ?? "text-muted-foreground";

  const agentSelector = (
    <div ref={agentSelectorRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!agentSelectorOpen) refreshHarnesses();
          setAgentSelectorOpen(!agentSelectorOpen);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
      >
        <Cpu className="size-3" />
        {agentId && connectionState === "ready" && selectedHarness ? (
          <>
            <Circle className={`size-1.5 fill-current ${agentStateColor}`} />
            <span className="max-w-[140px] truncate font-medium">
              {selectedHarness.name}
            </span>
          </>
        ) : agentId && connectionState === "initializing" ? (
          <>
            <Circle className={`size-1.5 fill-current ${agentStateColor}`} />
            <span className="max-w-[140px] truncate">Connecting…</span>
          </>
        ) : agentId && connectionState === "error" ? (
          <>
            <Circle className={`size-1.5 fill-current ${agentStateColor}`} />
            <span className="max-w-[140px] truncate">Error</span>
          </>
        ) : (
          <span>Select agent</span>
        )}
        <ChevronDown className="size-3 opacity-50" />
      </button>

      {agentSelectorOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md">
          {harnesses.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-muted-foreground">
              No agents installed.
              <br />
              <span className="text-[11px]">
                Use the registry button in the title bar.
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {harnesses.map((harness) => (
                <button
                  key={harness.agentId}
                  type="button"
                  onClick={() => handleSelectAgent(harness.agentId)}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted",
                    harness.agentId === agentId
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {harness.name}
                  <span className="text-[10px] opacity-50">
                    v{harness.version}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

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
              {agentId && connectionState === "ready"
                ? "Connected to an agent. Ask me anything!"
                : agentId && connectionState === "initializing"
                  ? "Connecting to agent…"
                  : "Select an agent below, or just start typing."}
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

        {/* Agent selector + input pinned to bottom */}
        <div className="border-t border-border/40 px-4 pt-2 pb-3">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2">{agentSelector}</div>
            <ChatInput
              onSend={handleSend}
              disabled={isThinking}
              slashCommands={slashCommands}
            />
          </div>
        </div>

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
      {/* Agent selector + input pinned to bottom */}
      <div className="border-t border-border/40 px-4 pt-2 pb-3">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2">{agentSelector}</div>
          <ChatInput
            onSend={handleSend}
            disabled={isThinking}
            slashCommands={slashCommands}
          />
        </div>
      </div>

      {/* Dialogs */}
      <PermissionDialog
        request={permissionRequest}
        onRespond={handlePermissionRespond}
      />
    </div>
  );
}
