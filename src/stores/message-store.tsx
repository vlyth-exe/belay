import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Message, MessageBlock } from "@/components/chat/types";

// ── Serialization helpers ────────────────────────────────────────────

/** Convert a Message to a plain object suitable for JSON / IPC. */
function serializeMessage(msg: Message): Record<string, unknown> {
  return {
    id: msg.id,
    role: msg.role,
    blocks: msg.blocks,
    timestamp:
      msg.timestamp instanceof Date
        ? msg.timestamp.toISOString()
        : String(msg.timestamp),
    // isStreaming is intentionally omitted — never persisted
  };
}

/** Convert a plain object (from IPC / JSON) back to a Message. */
function deserializeMessage(raw: Record<string, unknown>): Message {
  return {
    id: raw.id as string,
    role: raw.role as "user" | "assistant",
    blocks: (raw.blocks as MessageBlock[]) ?? [],
    timestamp:
      raw.timestamp instanceof Date
        ? raw.timestamp
        : new Date(raw.timestamp as string),
    // isStreaming is absent — defaults to undefined / falsy
  };
}

// ── Store types ──────────────────────────────────────────────────────

interface MessageStoreContextValue {
  /** Get cached messages for a session (undefined if not loaded yet). */
  getMessages: (sessionId: string) => Message[] | undefined;
  /** Set messages in the cache (does NOT persist to disk). */
  setMessages: (sessionId: string, messages: Message[]) => void;
  /** Load messages from disk into the cache. Returns the loaded messages. */
  loadSession: (sessionId: string) => Promise<Message[]>;
  /** Persist the cached messages for a session to disk. */
  saveSession: (sessionId: string) => Promise<void>;
  /** Delete a session's cache entry and its file on disk. */
  deleteSession: (sessionId: string) => void;
  /** Check whether a session has been loaded from disk. */
  isSessionLoaded: (sessionId: string) => boolean;
}

// ── Context ──────────────────────────────────────────────────────────

const MessageStoreContext = createContext<MessageStoreContextValue | null>(
  null,
);

// ── Provider ─────────────────────────────────────────────────────────

export function MessageStoreProvider({ children }: { children: ReactNode }) {
  // Refs so cache updates never trigger re-renders.
  // Each consuming hook owns its own useState for the session it cares about.
  const cacheRef = useRef(new Map<string, Message[]>());
  const loadedRef = useRef(new Set<string>());
  // Map of sessionId → in-flight Promise. Concurrent callers (e.g. React
  // StrictMode double-mount) share the same Promise instead of starting a
  // second load or returning stale empty cache.
  const loadingPromisesRef = useRef(new Map<string, Promise<Message[]>>());

  const getMessages = useCallback(
    (sessionId: string): Message[] | undefined => {
      return cacheRef.current.get(sessionId);
    },
    [],
  );

  const setMessages = useCallback((sessionId: string, messages: Message[]) => {
    cacheRef.current.set(sessionId, messages);
  }, []);

  const loadSession = useCallback(
    async (sessionId: string): Promise<Message[]> => {
      // Already loaded — return from cache immediately
      if (loadedRef.current.has(sessionId)) {
        return cacheRef.current.get(sessionId) ?? [];
      }

      // A load is already in-flight — reuse the same Promise so all
      // callers wait for the same result instead of returning empty cache.
      const existing = loadingPromisesRef.current.get(sessionId);
      if (existing) {
        return existing;
      }

      // Start a new load
      const promise = (async (): Promise<Message[]> => {
        try {
          const raw =
            (await window.electronAPI?.sessionLoadMessages(sessionId)) ?? [];

          const messages: Message[] = raw.map((r: Record<string, unknown>) =>
            deserializeMessage(r),
          );

          console.log(
            `[MessageStore] Loaded ${messages.length} messages for session ${sessionId.slice(0, 8)}…`,
          );

          cacheRef.current.set(sessionId, messages);
          loadedRef.current.add(sessionId);
          return messages;
        } catch (err) {
          console.error(
            `[MessageStore] Failed to load session ${sessionId}:`,
            err,
          );
          cacheRef.current.set(sessionId, []);
          loadedRef.current.add(sessionId);
          return [];
        } finally {
          loadingPromisesRef.current.delete(sessionId);
        }
      })();

      loadingPromisesRef.current.set(sessionId, promise);
      return promise;
    },
    [],
  );

  const saveSession = useCallback(async (sessionId: string): Promise<void> => {
    const messages = cacheRef.current.get(sessionId);
    if (!messages) {
      console.warn(
        `[MessageStore] saveSession called for ${sessionId.slice(0, 8)}… but no cached messages found`,
      );
      return;
    }

    const serialized = messages.map(serializeMessage);

    console.log(
      `[MessageStore] Saving ${messages.length} messages for session ${sessionId.slice(0, 8)}…`,
    );

    try {
      await window.electronAPI?.sessionSaveMessages(sessionId, serialized);
    } catch (err) {
      console.error(`[MessageStore] Failed to save session ${sessionId}:`, err);
    }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    cacheRef.current.delete(sessionId);
    loadedRef.current.delete(sessionId);
    loadingPromisesRef.current.delete(sessionId);
    window.electronAPI?.sessionDeleteMessages(sessionId).catch((err) => {
      console.error(
        `[MessageStore] Failed to delete session file ${sessionId}:`,
        err,
      );
    });
  }, []);

  const isSessionLoaded = useCallback((sessionId: string): boolean => {
    return loadedRef.current.has(sessionId);
  }, []);

  // Memoize the context value so the object reference is stable across
  // re-renders.  Each method is already wrapped in useCallback with empty
  // deps, so they never change.
  const value = useMemo<MessageStoreContextValue>(
    () => ({
      getMessages,
      setMessages,
      loadSession,
      saveSession,
      deleteSession,
      isSessionLoaded,
    }),
    [
      getMessages,
      setMessages,
      loadSession,
      saveSession,
      deleteSession,
      isSessionLoaded,
    ],
  );

  return (
    <MessageStoreContext.Provider value={value}>
      {children}
    </MessageStoreContext.Provider>
  );
}

// ── Hook: per-session messages ───────────────────────────────────────

interface UseSessionMessagesResult {
  /** Current messages for this session. */
  messages: Message[];
  /**
   * Set messages — accepts a new array or a functional updater.
   * Updates both the local React state and the shared cache (but does
   * NOT automatically persist to disk — call `saveMessages()` for that).
   */
  setMessages: (update: Message[] | ((prev: Message[]) => Message[])) => void;
  /** Persist the current cached messages for this session to disk. */
  saveMessages: () => Promise<void>;
  /** Whether the session's messages have been loaded from disk. */
  isLoaded: boolean;
}

export function useSessionMessages(
  sessionId: string,
): UseSessionMessagesResult {
  const store = useContext(MessageStoreContext);
  if (!store) {
    throw new Error(
      "useSessionMessages must be used within a <MessageStoreProvider>",
    );
  }

  // Local state, initialised from cache if available
  const [messages, setMessagesInternal] = useState<Message[]>(() => {
    return store.getMessages(sessionId) ?? [];
  });

  const [isLoaded, setIsLoaded] = useState<boolean>(() =>
    store.isSessionLoaded(sessionId),
  );

  // Load from disk on mount / sessionId change.
  // The `store` reference is now memoized so this only re-runs when
  // sessionId actually changes.
  useEffect(() => {
    let cancelled = false;

    store.loadSession(sessionId).then((loaded) => {
      if (cancelled) return;
      setMessagesInternal(loaded);
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId, store]);

  // Wrapper that keeps local state and cache in sync.
  //
  // IMPORTANT: The cache is updated SYNCHRONOUSLY (outside React's
  // batching) so that saveMessages() always reads the latest data
  // even when called immediately after setMessages().  Reading
  // "current" from the cache (instead of React's functional updater)
  // is safe because we keep the cache in lockstep — every call
  // updates the cache before the next one can read it.
  const setMessages = useCallback(
    (update: Message[] | ((prev: Message[]) => Message[])) => {
      const current = store.getMessages(sessionId) ?? [];
      const next = typeof update === "function" ? update(current) : update;
      // Update cache immediately (synchronous — not deferred by React)
      store.setMessages(sessionId, next);
      // Update React state (may be batched, but cache is already current)
      setMessagesInternal(next);
    },
    [sessionId, store],
  );

  // Persist current cache to disk
  const saveMessages = useCallback(async () => {
    await store.saveSession(sessionId);
  }, [sessionId, store]);

  return { messages, setMessages, saveMessages, isLoaded };
}

// ── Hook: raw store access (for deleteSession etc.) ──────────────────

export function useMessageStore(): MessageStoreContextValue {
  const ctx = useContext(MessageStoreContext);
  if (!ctx) {
    throw new Error(
      "useMessageStore must be used within a <MessageStoreProvider>",
    );
  }
  return ctx;
}
