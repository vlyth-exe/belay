import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────

export type SessionStatus = "idle" | "running" | "unseen";

interface SessionStatusWrite {
  /** Update the status of a session. No-op if the status hasn't changed. */
  setStatus: (sessionId: string, status: SessionStatus) => void;
  /** Mark a session as seen (unseen → idle). No-op if not unseen. */
  markSeen: (sessionId: string) => void;
}

interface SessionStatusRead {
  /** Get the current status of a session. Returns "idle" if not tracked. */
  getStatus: (sessionId: string) => SessionStatus;
}

// ── Contexts (split read/write so writers don't re-render) ────────────

const WriteContext = createContext<SessionStatusWrite | null>(null);
const ReadContext = createContext<SessionStatusRead | null>(null);

// ── Provider ──────────────────────────────────────────────────────────

export function SessionStatusStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const mapRef = useRef(new Map<string, SessionStatus>());
  // Bumped on every mutation so the read-context value changes and
  // consumers (the sidebar) re-render.
  const [version, setVersion] = useState(0);

  const setStatus = useCallback(
    (sessionId: string, status: SessionStatus) => {
      if (mapRef.current.get(sessionId) === status) return;
      mapRef.current.set(sessionId, status);
      setVersion((v) => v + 1);
    },
    [],
  );

  const markSeen = useCallback((sessionId: string) => {
    if (mapRef.current.get(sessionId) !== "unseen") return;
    mapRef.current.set(sessionId, "idle");
    setVersion((v) => v + 1);
  }, []);

  const getStatus = useCallback((sessionId: string): SessionStatus => {
    return mapRef.current.get(sessionId) ?? "idle";
  }, []);

  // Write value is fully stable — never triggers a re-render.
  const writeValue = useMemo<SessionStatusWrite>(
    () => ({ setStatus, markSeen }),
    [setStatus, markSeen],
  );

  // Read value changes when version changes, triggering re-renders in
  // any component that calls useSessionStatusRead().
  const readValue = useMemo<SessionStatusRead>(
    () => ({ getStatus }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getStatus, version],
  );

  return (
    <WriteContext.Provider value={writeValue}>
      <ReadContext.Provider value={readValue}>{children}</ReadContext.Provider>
    </WriteContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────

/**
 * Write-only access to session statuses.
 * Does **not** cause re-renders when statuses change.
 * Use in Chat components that only need to update status.
 */
export function useSessionStatusWrite(): SessionStatusWrite {
  const ctx = useContext(WriteContext);
  if (!ctx) {
    throw new Error(
      "useSessionStatusWrite must be used within a <SessionStatusStoreProvider>",
    );
  }
  return ctx;
}

/**
 * Read access to session statuses.
 * Re-renders whenever **any** session status changes.
 * Use in the sidebar to render status icons.
 */
export function useSessionStatusRead(): SessionStatusRead {
  const ctx = useContext(ReadContext);
  if (!ctx) {
    throw new Error(
      "useSessionStatusRead must be used within a <SessionStatusStoreProvider>",
    );
  }
  return ctx;
}
