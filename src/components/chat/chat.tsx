import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronDown, Cpu, Zap } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { PermissionDialog } from "./permission-dialog";
import type { Message, MessageBlock, ToolCallInfo } from "./types";
import type { AcpAvailableCommand, AcpSessionMode } from "@/types/acp";

import {
  useConnectionState,
  useAcpActions,
  useInstalledHarnesses,
} from "@/hooks/use-acp";
import { useSessionMessages, useMessageStore } from "@/stores/message-store";
import { useSessionStatusWrite } from "@/stores/session-status-store";
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

// ── Agent capabilities cache (persists to localStorage) ────────────
// Stores modes and slash commands per agent so they're available
// instantly when reopening a saved session, without waiting for the
// agent process to start and create a new ACP session.
// Persisted to localStorage so the cache survives app restarts.

interface CachedCapabilities {
  modes: AcpSessionMode[];
  currentModeId: string | null;
  slashCommands: AcpAvailableCommand[];
}

const CAPABILITIES_STORAGE_KEY = "belay-agent-capabilities";

function loadCapabilitiesCache(): Map<string, CachedCapabilities> {
  try {
    const raw = localStorage.getItem(CAPABILITIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CachedCapabilities>;
      return new Map(Object.entries(parsed));
    }
  } catch {
    // Ignore corrupt data
  }
  return new Map();
}

function saveCapabilitiesCache(cache: Map<string, CachedCapabilities>): void {
  try {
    const obj = Object.fromEntries(cache.entries());
    localStorage.setItem(CAPABILITIES_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore quota errors
  }
}

const agentCapabilitiesCache = loadCapabilitiesCache();

function updateCapabilitiesCache(
  agentId: string,
  partial: Partial<CachedCapabilities>,
): void {
  const existing = agentCapabilitiesCache.get(agentId) ?? {
    modes: [],
    currentModeId: null,
    slashCommands: [],
  };
  agentCapabilitiesCache.set(agentId, { ...existing, ...partial });
  saveCapabilitiesCache(agentCapabilitiesCache);
}

// ── Chat Component ─────────────────────────────────────────────────

interface ChatProps {
  sessionId: string;
  projectId: string;
  projectPath?: string;
}

export function Chat({ sessionId, projectId, projectPath }: ChatProps) {
  // ── Persisted message state ──────────────────────────────────────
  const { messages, setMessages, saveMessages, isLoaded } =
    useSessionMessages(sessionId);
  const messageStore = useMessageStore();

  const [isThinking, setIsThinking] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | undefined>(
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Session status ──────────────────────────────────────────────
  const { setStatus, markSeen } = useSessionStatusWrite();

  // ── Agent selection ───────────────────────────────────────────────
  const [agentSelectorOpen, setAgentSelectorOpen] = useState(false);
  const agentSelectorRef = useRef<HTMLDivElement>(null);

  // Look up the agentId for this session from the project store
  const {
    renameSession,
    setSessionAgent,
    openProjects,
    addSession,
    setActiveSession,
    activeProjectId,
  } = useProjectStore();
  const activeProject = openProjects.find((p) => p.id === projectId);
  const isSessionActive =
    activeProjectId === projectId &&
    activeProject?.activeSessionId === sessionId;
  const agentId =
    activeProject?.sessions.find((s) => s.id === sessionId)?.agentId ?? null;

  // Agent list for the selector dropdown
  const { harnesses, refresh: refreshHarnesses } = useInstalledHarnesses();

  // ACP state — keyed by the selected agent
  const connectionState = useConnectionState(agentId ?? "");
  const { connect, sendPrompt, cancelPrompt, createSession, setSessionMode } =
    useAcpActions();

  // The ACP session ID (separate from the UI sessionId used for persistence)
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  // Ref mirror so the streaming listener always reads the latest value
  // without waiting for React to re-render and re-register the effect.
  const acpSessionIdRef = useRef<string | null>(null);

  // Slash commands & modes — pre-populated from cache for instant
  // availability on reload, refreshed when the agent sends updates.
  const cached = agentCapabilitiesCache.get(agentId ?? "");

  const [slashCommands, setSlashCommands] = useState<AcpAvailableCommand[]>(
    () => cached?.slashCommands ?? [],
  );

  // ── Session modes ──────────────────────────────────────────────────
  const [availableModes, setAvailableModes] = useState<AcpSessionMode[]>(
    () => cached?.modes ?? [],
  );
  const [currentModeId, setCurrentModeId] = useState<string | null>(
    () => cached?.currentModeId ?? null,
  );

  const [permissionRequest, setPermissionRequest] = useState<{
    requestId: string;
    sessionId: string;
    description: string;
    options: Array<{ id: string; label: string; kind: string }>;
  } | null>(null);

  // The ID of the assistant message currently being streamed into
  const streamingMessageId = useRef<string | null>(null);

  // Track whether we've ever connected, so the reset effect doesn't
  // wipe cached modes/commands on initial mount (connectionState starts
  // as "disconnected" but we haven't actually lost a connection yet).
  const hasConnectedRef = useRef(false);

  // ── Restore modes/commands from cache when agentId changes ──────
  useEffect(() => {
    if (!agentId) return;
    const cached = agentCapabilitiesCache.get(agentId);
    if (cached) {
      setAvailableModes(cached.modes);
      setCurrentModeId(cached.currentModeId);
      setSlashCommands(cached.slashCommands);
    } else {
      setAvailableModes([]);
      setCurrentModeId(null);
      setSlashCommands([]);
    }
  }, [agentId]);

  // ── Auto-connect to saved agent on mount ─────────────────────────
  useEffect(() => {
    if (!agentId) return;
    connect(agentId).catch((err) =>
      console.error("[Chat] Auto-connect failed:", err),
    );
    refreshHarnesses();
  }, [agentId, connect]);

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
        // Capture available modes from the session response
        const modes =
          typeof result === "string"
            ? null
            : ((
                result as
                  | {
                      modes?: {
                        currentModeId: string;
                        availableModes: AcpSessionMode[];
                      };
                    }
                  | undefined
              )?.modes ?? null);
        if (modes) {
          setAvailableModes(modes.availableModes);
          setCurrentModeId(modes.currentModeId);
          updateCapabilitiesCache(agentId, {
            modes: modes.availableModes,
            currentModeId: modes.currentModeId,
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [connectionState, acpSessionId, agentId, createSession, projectPath]);

  // ── Reset ACP session when connection drops ──────────────────────
  // Skipped on initial mount (hasConnectedRef guard) so we don't wipe
  // the cached modes/commands that were restored from localStorage.
  useEffect(() => {
    if (connectionState === "disconnected" && hasConnectedRef.current) {
      setAcpSessionId(null);
      acpSessionIdRef.current = null;
      setAvailableModes([]);
      setCurrentModeId(null);
      setSlashCommands([]);
    }
    if (connectionState === "ready") {
      hasConnectedRef.current = true;
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

      const inner = notification.update as Record<string, unknown> | undefined;
      if (!inner) return;

      const sessionUpdate = inner.sessionUpdate as string | undefined;

      // ── Session ID filter ────────────────────────────────────────
      // Use the REF so we always read the latest value, even when
      // handleSend sets acpSessionId and calls sendPrompt before
      // React has re-rendered and re-registered this listener.
      const currentAcpSessionId = acpSessionIdRef.current;
      const notifSessionId = notification.sessionId as string | undefined;

      // Mode/command updates can arrive before acpSessionIdRef is set
      // (race: createSession IPC resolves AFTER the agent has already
      // sent notifications).  Accept them when we have no session yet;
      // once we do, filter normally.
      const isEarlyUpdate =
        sessionUpdate === "current_mode_update" ||
        sessionUpdate === "available_commands_update" ||
        sessionUpdate === "session_info_update";

      if (isEarlyUpdate) {
        // If we already have a session, only accept matching notifications
        if (currentAcpSessionId && notifSessionId !== currentAcpSessionId)
          return;
      } else {
        // All other (streaming) updates require an active session match
        if (!currentAcpSessionId || notifSessionId !== currentAcpSessionId)
          return;
      }

      // ── Mode update (no streaming message needed) ───────────────
      if (sessionUpdate === "current_mode_update") {
        const modeId = inner.currentModeId as string | undefined;
        if (modeId) {
          setCurrentModeId(modeId);
          if (agentId)
            updateCapabilitiesCache(agentId, { currentModeId: modeId });
        }
        return;
      }

      // ── Slash commands update ──────────────────────────────────
      if (sessionUpdate === "available_commands_update") {
        const cmds = inner.availableCommands as
          | AcpAvailableCommand[]
          | undefined;
        if (cmds) {
          setSlashCommands(cmds);
          if (agentId)
            updateCapabilitiesCache(agentId, { slashCommands: cmds });
        }
        return;
      }

      // ── Session info update (title from agent) ──────────────────
      if (sessionUpdate === "session_info_update") {
        const title = inner.title as string | undefined;
        if (title) renameSession(projectId, sessionId, title);
        return;
      }

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

  // ── Sync session status to the shared store ──────────────────────
  // Tracks how many messages the user has actually seen (i.e. while the
  // session was active).  After the initial load from disk we snapshot
  // the count so that previously-saved messages are never flagged as
  // "unseen".  From that point on, any new assistant messages that
  // arrive while the session is inactive trigger the unseen badge.
  const seenCountRef = useRef<number | null>(null);

  // Track whether we've already fired a native notification for the
  // current completion so we don't spam the user on re-renders.
  // Starts as true so sessions loaded from disk don't fire notifications
  // on mount. Gets reset to false only when isThinking becomes true.
  const notifiedRef = useRef(true);

  // Snapshot the message count once the initial load finishes so
  // previously-saved messages aren't treated as "unseen".
  useEffect(() => {
    if (isLoaded && seenCountRef.current === null) {
      seenCountRef.current = messages.length;
    }
  }, [isLoaded, messages.length]);

  // While the session is active AND not thinking, keep the seen-count
  // in sync and clear any unseen badge.  We exclude the thinking state
  // so that streaming assistant messages aren't counted as "seen" —
  // otherwise switching away mid-response would never trigger "unseen".
  useEffect(() => {
    if (isSessionActive && !isThinking) {
      seenCountRef.current = messages.length;
      markSeen(sessionId);
    }
  }, [isSessionActive, isThinking, messages.length, markSeen, sessionId]);

  // Determine the visual status: running → unseen → idle.
  // Also fires a native OS notification when a prompt finishes. The main
  // process checks whether the window is minimised / unfocused to decide
  // if the notification should actually be shown.
  const sessionTitle =
    activeProject?.sessions.find((s) => s.id === sessionId)?.title ?? "Chat";

  useEffect(() => {
    if (isThinking) {
      setStatus(sessionId, "running");
      notifiedRef.current = false;
      return;
    }

    // ── Prompt finished: send notification (main process checks window) ──
    if (!notifiedRef.current && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && !lastMsg.isStreaming) {
        notifiedRef.current = true;
        window.electronAPI?.notificationSend(
          sessionTitle,
          "Agent finished responding",
          isSessionActive,
          projectId,
          sessionId,
        );
      }
    }

    // ── Status badge ──────────────────────────────────────────────
    if (isSessionActive) {
      setStatus(sessionId, "idle");
    } else if (
      seenCountRef.current !== null &&
      messages.length > seenCountRef.current &&
      messages.length > 0
    ) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && !lastMsg.isStreaming) {
        setStatus(sessionId, "unseen");
      } else {
        setStatus(sessionId, "idle");
      }
    } else {
      setStatus(sessionId, "idle");
    }
  }, [
    messages,
    isThinking,
    isSessionActive,
    projectId,
    sessionId,
    setStatus,
    sessionTitle,
  ]);

  // ── Permission response handler ──────────────────────────────────
  const handlePermissionRespond = useCallback(
    (requestId: string, optionId: string) => {
      window.electronAPI?.acpRespondPermission(requestId, optionId);
      setPermissionRequest(null);
    },
    [],
  );

  // ── Handle mode selection from @ autocomplete ───────────────────
  const handleModeSelect = useCallback(
    async (modeId: string) => {
      if (!agentId || !acpSessionId || modeId === currentModeId) return;
      setCurrentModeId(modeId);
      try {
        await setSessionMode(agentId, acpSessionId, modeId);
      } catch (err) {
        console.error("[Chat] Failed to set mode from @ mention:", err);
      }
    },
    [agentId, acpSessionId, currentModeId, setSessionMode],
  );

  // ── Send a message ───────────────────────────────────────────────
  const handleSend = useCallback(
    async (content: string) => {
      let trimmed = content.trim();
      if (!trimmed || isThinking) return;

      // ── Parse @mode mentions from the start of the message ──────
      // Pattern: @ModeName (rest of message). The mode name must match
      // one of the available modes (case-insensitive on the name or id).
      let modeSwitched = false;
      const atMatch = trimmed.match(/^@(\S+)\s*/);
      if (atMatch && availableModes.length > 0) {
        const mention = atMatch[1].toLowerCase();
        const matched = availableModes.find(
          (m) =>
            m.name.toLowerCase() === mention || m.id.toLowerCase() === mention,
        );
        if (matched) {
          // Switch mode
          if (agentId && acpSessionId && matched.id !== currentModeId) {
            setCurrentModeId(matched.id);
            setSessionMode(agentId, acpSessionId, matched.id).catch((err) =>
              console.error("[Chat] Failed to set mode from @ mention:", err),
            );
          }
          modeSwitched = true;
          // Strip the @mention and its trailing whitespace
          trimmed = trimmed.slice(atMatch[0].length).trim();
          if (!trimmed) return; // was only a mode mention, nothing to send
        }
      }

      const displayContent = modeSwitched ? content.trim() : trimmed;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        blocks: [
          { id: crypto.randomUUID(), type: "text", content: displayContent },
        ],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Auto-title session from first user message
      if (messages.length === 0) {
        const title =
          displayContent.length > 80
            ? displayContent.slice(0, 77) + "..."
            : displayContent;
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
              // Capture available modes from the session response
              const modes =
                typeof result === "string"
                  ? null
                  : ((
                      result as
                        | {
                            modes?: {
                              currentModeId: string;
                              availableModes: AcpSessionMode[];
                            };
                          }
                        | undefined
                    )?.modes ?? null);
              if (modes) {
                setAvailableModes(modes.availableModes);
                setCurrentModeId(modes.currentModeId);
                updateCapabilitiesCache(agentId!, {
                  modes: modes.availableModes,
                  currentModeId: modes.currentModeId,
                });
              }
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
        // ── No agent selected ─────────────────────────────────────
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          blocks: [
            {
              id: crypto.randomUUID(),
              type: "text",
              content:
                "⚠️ **Please select a Harness** before sending a message.",
            },
          ],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        saveMessages();
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

  // ── Edit / resend a previous user message ────────────────────────
  const handleStartEdit = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  const handleEditSubmit = useCallback(
    (messageId: string, newContent: string) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;

      // Truncate messages to before this one (removes the message and all after it)
      setMessages(messages.slice(0, msgIndex));
      setEditingMessageId(undefined);
      // Persist the truncated history
      saveMessages();

      // Send the edited content as a new message
      handleSend(newContent);
    },
    [messages, setMessages, saveMessages, handleSend],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(undefined);
  }, []);

  // ── Branch: create a new session from a specific message ────────
  const handleBranch = useCallback(
    (messageId: string) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;

      // Copy messages up to and including the branched message, plus the
      // assistant response that follows it (if any).
      const endIndex =
        msgIndex + 1 < messages.length &&
        messages[msgIndex + 1].role === "assistant"
          ? msgIndex + 2
          : msgIndex + 1;
      const branchedMessages = messages.slice(0, endIndex);

      // Create a new session
      const newSessionId = addSession(projectId);

      // Carry the current agent over to the new session
      if (agentId) {
        setSessionAgent(projectId, newSessionId, agentId);
      }

      // Pre-populate the message store cache for the new session and persist
      messageStore.setMessages(newSessionId, branchedMessages);
      messageStore.saveSession(newSessionId);

      // Derive a title from the first user message
      const firstUserMsg = branchedMessages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const textBlock = firstUserMsg.blocks.find((b) => b.type === "text");
        const content = textBlock?.type === "text" ? textBlock.content : "";
        if (content) {
          const title =
            content.length > 80 ? content.slice(0, 77) + "..." : content;
          renameSession(projectId, newSessionId, title);
        }
      }

      // Navigate to the new session
      setActiveSession(projectId, newSessionId);
    },
    [
      messages,
      projectId,
      agentId,
      addSession,
      setSessionAgent,
      messageStore,
      renameSession,
      setActiveSession,
    ],
  );

  // ── Agent selector UI ────────────────────────────────────────────
  const selectedHarness = harnesses.find((h) => h.agentId === agentId);

  // ── Mode selector ────────────────────────────────────────────────
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);
  const modeSelectorRef = useRef<HTMLDivElement>(null);

  // Close mode selector on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        modeSelectorRef.current &&
        !modeSelectorRef.current.contains(e.target as Node)
      ) {
        setModeSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleModeChange = useCallback(
    async (modeId: string) => {
      setModeSelectorOpen(false);
      if (!agentId || !acpSessionId || modeId === currentModeId) return;
      setCurrentModeId(modeId);
      try {
        await setSessionMode(agentId, acpSessionId, modeId);
      } catch (err) {
        console.error("[Chat] Failed to set mode:", err);
        setCurrentModeId(currentModeId);
      }
    },
    [agentId, acpSessionId, currentModeId, setSessionMode],
  );

  const modeSelector =
    availableModes.length > 1 && currentModeId ? (
      <div ref={modeSelectorRef} className="relative">
        <button
          type="button"
          onClick={() => setModeSelectorOpen(!modeSelectorOpen)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        >
          <Zap className="size-3" />
          <span className="max-w-[100px] truncate">
            {availableModes.find((m) => m.id === currentModeId)?.name ??
              currentModeId}
          </span>
          <ChevronDown className="size-3 opacity-50" />
        </button>

        {modeSelectorOpen && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md">
            <div className="space-y-0.5">
              {availableModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleModeChange(mode.id)}
                  className={[
                    "flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                    mode.id === currentModeId
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px]">{mode.name}</div>
                    {mode.description && (
                      <div className="mt-0.5 text-[10px] leading-snug opacity-60">
                        {mode.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null;

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
          <span className="max-w-[140px] truncate font-medium">
            {selectedHarness.name}
          </span>
        ) : agentId && connectionState === "initializing" ? (
          <span className="max-w-[140px] truncate">Connecting…</span>
        ) : agentId && connectionState === "error" ? (
          <span className="max-w-[140px] truncate">Error</span>
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
        <div className="flex-1" />

        {/* Agent selector + input pinned to bottom */}
        <div className="border-t border-border/40 px-4 pt-2 pb-3">
          <div className="mx-auto max-w-4xl">
            <div className="mb-2 flex items-center gap-2">
              {agentSelector}
              {modeSelector}
            </div>
            <ChatInput
              onSend={handleSend}
              disabled={!agentId || isThinking}
              placeholder={
                agentId ? undefined : "Select an agent to get started…"
              }
              slashCommands={slashCommands}
              modes={availableModes}
              onModeSelect={handleModeSelect}
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
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isEditing={editingMessageId === message.id}
                onEdit={message.role === "user" ? handleStartEdit : undefined}
                onBranch={message.role === "user" ? handleBranch : undefined}
                onEditSubmit={
                  message.role === "user" ? handleEditSubmit : undefined
                }
                onEditCancel={handleCancelEdit}
              />
            ))}

            {/* Typing indicator (only when not streaming via ACP) */}
            {isThinking && !isStreaming && (
              <div className="flex items-center gap-1 px-1 py-2">
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
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

      {/* Agent selector + input pinned to bottom */}
      <div className="border-t border-border/40 px-4 pt-2 pb-3">
        <div className="mx-auto max-w-4xl">
          <div className="mb-2 flex items-center gap-2">
            {agentSelector}
            {modeSelector}
          </div>
          <ChatInput
            onSend={handleSend}
            disabled={!agentId || isThinking}
            placeholder={
              agentId ? undefined : "Select an agent to get started…"
            }
            slashCommands={slashCommands}
            modes={availableModes}
            onModeSelect={handleModeSelect}
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
