import { useEffect, useState, useCallback, useRef } from "react";
import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";
import { ProjectWelcome } from "@/components/project/project-welcome";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { RightSidebar } from "@/components/side-pane/right-sidebar";
import { ProjectStoreProvider, useProjectStore } from "@/stores/project-store";
import { MessageStoreProvider } from "@/stores/message-store";
import { SessionStatusStoreProvider } from "@/stores/session-status-store";
import { useInstalledHarnesses } from "@/hooks/use-acp";

// ── Right sidebar persistence (per-session) ────────────────────────

const SIDEBAR_STATE_KEY = "belay:rightSidebar:openSessions";

function loadSidebarSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSidebarSessions(ids: Set<string>): void {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
}

const SIDEBAR_TAB_KEY = "belay:rightSidebar:sessionTabs";

function loadSidebarTabs(): Map<string, string> {
  try {
    const raw = localStorage.getItem(SIDEBAR_TAB_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return new Map();
  }
}

function persistSidebarTabs(tabs: Map<string, string>): void {
  try {
    localStorage.setItem(
      SIDEBAR_TAB_KEY,
      JSON.stringify(Object.fromEntries(tabs)),
    );
  } catch {
    // Ignore storage errors
  }
}

// ── Terminal types ──────────────────────────────────────────────────

export interface SpawnOptions {
  shell?: string;
  args?: string[];
  isWsl?: boolean;
  wslDistro?: string;
}

export interface TerminalTab {
  id: string;
  label: string;
  spawnOptions?: SpawnOptions;
}

interface SessionTerminals {
  tabs: TerminalTab[];
  activeTabId: string;
  nextLabel: number;
}

// ── App layout ─────────────────────────────────────────────────────

function AppLayout() {
  const { openProjects, activeProjectId, setActiveProject, setActiveSession } =
    useProjectStore();
  const { harnesses } = useInstalledHarnesses();

  // ── Terminal state: multiple tabs per session ─────────────────────
  const [sessionTerminals, setSessionTerminals] = useState<
    Map<string, SessionTerminals>
  >(new Map());
  const sessionTerminalsRef = useRef<Map<string, SessionTerminals>>(new Map());

  // ── Right sidebar state: per-session open/closed + active tab ──────
  const [sessionSidebarOpen, setSessionSidebarOpen] =
    useState<Set<string>>(loadSidebarSessions);
  const [sessionSidebarTab, setSessionSidebarTab] =
    useState<Map<string, string>>(loadSidebarTabs);

  const toggleSidebar = useCallback((sessionId: string) => {
    setSessionSidebarOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      persistSidebarSessions(next);
      return next;
    });
  }, []);

  const setSessionTab = useCallback((sessionId: string, tab: string) => {
    setSessionSidebarTab((prev) => {
      const next = new Map(prev);
      next.set(sessionId, tab);
      persistSidebarTabs(next);
      return next;
    });
  }, []);

  const syncRef = (next: Map<string, SessionTerminals>) => {
    sessionTerminalsRef.current = next;
    return next;
  };

  /** Toggle terminal panel for a session. Opens the panel with one tab
   *  if closed; closes the entire panel (kills all tabs) if open. */
  const toggleTerminal = useCallback(
    (sessionId: string, spawnOptions?: SpawnOptions) => {
      setSessionTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);

        if (!existing || existing.tabs.length === 0) {
          // Open panel with first tab
          const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          next.set(sessionId, {
            tabs: [{ id: tabId, label: "Terminal 1", spawnOptions }],
            activeTabId: tabId,
            nextLabel: 2,
          });
        } else {
          // Close panel — kill all running PTY processes
          existing.tabs.forEach((t) => window.electronAPI?.terminalKill(t.id));
          next.delete(sessionId);
        }

        return syncRef(next);
      });
    },
    [],
  );

  /** Add a new terminal tab to an already-open panel. */
  const addTab = useCallback(
    (sessionId: string, spawnOptions?: SpawnOptions) => {
      setSessionTerminals((prev) => {
        const existing = prev.get(sessionId);
        if (!existing) return prev;

        const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next = new Map(prev);
        next.set(sessionId, {
          ...existing,
          tabs: [
            ...existing.tabs,
            {
              id: tabId,
              label: `Terminal ${existing.nextLabel}`,
              spawnOptions,
            },
          ],
          activeTabId: tabId,
          nextLabel: existing.nextLabel + 1,
        });

        return syncRef(next);
      });
    },
    [],
  );

  /** Close a specific terminal tab. Removes the panel if it was the last tab. */
  const closeTab = useCallback((sessionId: string, tabId: string) => {
    setSessionTerminals((prev) => {
      const existing = prev.get(sessionId);
      if (!existing) return prev;

      window.electronAPI?.terminalKill(tabId);

      const newTabs = existing.tabs.filter((t) => t.id !== tabId);

      if (newTabs.length === 0) {
        const next = new Map(prev);
        next.delete(sessionId);
        return syncRef(next);
      }

      const newActiveId =
        existing.activeTabId === tabId ? newTabs[0].id : existing.activeTabId;

      const next = new Map(prev);
      next.set(sessionId, {
        ...existing,
        tabs: newTabs,
        activeTabId: newActiveId,
      });
      return syncRef(next);
    });
  }, []);

  /** Switch the active terminal tab. */
  const selectTab = useCallback((sessionId: string, tabId: string) => {
    setSessionTerminals((prev) => {
      const existing = prev.get(sessionId);
      if (!existing || existing.activeTabId === tabId) return prev;
      const next = new Map(prev);
      next.set(sessionId, { ...existing, activeTabId: tabId });
      return syncRef(next);
    });
  }, []);

  /** Rename a terminal tab. */
  const renameTab = useCallback(
    (sessionId: string, tabId: string, label: string) => {
      setSessionTerminals((prev) => {
        const existing = prev.get(sessionId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(sessionId, {
          ...existing,
          tabs: existing.tabs.map((t) =>
            t.id === tabId ? { ...t, label } : t,
          ),
        });
        return syncRef(next);
      });
    },
    [],
  );

  /** Reorder terminal tabs (e.g. via drag-and-drop). */
  const reorderTabs = useCallback(
    (sessionId: string, fromIndex: number, toIndex: number) => {
      setSessionTerminals((prev) => {
        const existing = prev.get(sessionId);
        if (!existing) return prev;

        const tabs = [...existing.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);

        const next = new Map(prev);
        next.set(sessionId, { ...existing, tabs });
        return syncRef(next);
      });
    },
    [],
  );

  // Kill terminal processes and clean sidebar state for sessions that no longer exist
  useEffect(() => {
    const currentSessionIds = new Set(
      openProjects.flatMap((p) => p.sessions.map((s) => s.id)),
    );

    // Terminal cleanup
    let terminalsChanged = false;
    const nextTerminals = new Map(sessionTerminalsRef.current);
    for (const [sessionId, data] of nextTerminals) {
      if (!currentSessionIds.has(sessionId)) {
        data.tabs.forEach((t) => window.electronAPI?.terminalKill(t.id));
        nextTerminals.delete(sessionId);
        terminalsChanged = true;
      }
    }
    if (terminalsChanged) {
      sessionTerminalsRef.current = nextTerminals;
      setSessionTerminals(nextTerminals);
    }

    // Sidebar cleanup (open state)
    let sidebarChanged = false;
    setSessionSidebarOpen((prev) => {
      const next = new Set(prev);
      for (const id of next) {
        if (!currentSessionIds.has(id)) {
          next.delete(id);
          sidebarChanged = true;
        }
      }
      if (sidebarChanged) persistSidebarSessions(next);
      return sidebarChanged ? next : prev;
    });

    // Sidebar cleanup (tab state)
    let tabChanged = false;
    setSessionSidebarTab((prev) => {
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!currentSessionIds.has(id)) {
          next.delete(id);
          tabChanged = true;
        }
      }
      if (tabChanged) persistSidebarTabs(next);
      return tabChanged ? next : prev;
    });
  }, [openProjects]);

  // ── Notification click handler: navigate to the relevant session ──
  useEffect(() => {
    return window.electronAPI?.onNotificationClick(
      ({ projectId, sessionId }) => {
        setActiveProject(projectId);
        setActiveSession(projectId, sessionId);
      },
    );
  }, [setActiveProject, setActiveSession]);

  // ── Welcome page (no projects open) ────────────────────────────────
  if (openProjects.length === 0) {
    return (
      <div
        id="app-container"
        className="flex h-screen w-screen flex-col bg-background"
      >
        <TitleBar />
        <div className="flex-1">
          <ProjectWelcome />
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────
  const activeProject = openProjects.find((p) => p.id === activeProjectId);
  const activeSessionId = activeProject?.activeSessionId ?? null;
  const activeSession = activeProject?.sessions.find(
    (s) => s.id === activeSessionId,
  );

  return (
    <div
      id="app-container"
      className="flex h-screen w-screen flex-col bg-background"
    >
      <TitleBar projectPath={activeSession?.path ?? activeProject?.path} />
      <div className="flex min-h-0 flex-1">
        <ProjectSidebar />
        {/* Chat area — render every session's chat; only the active one is visible */}
        <div className="relative min-w-0 flex-1">
          {openProjects.map((project) =>
            project.sessions.map((session) => {
              const isActive =
                session.id === activeSessionId &&
                project.id === activeProjectId;
              const terminalData = sessionTerminals.get(session.id);
              const isTerminalOpen =
                !!terminalData && terminalData.tabs.length > 0;

              // Detect WSL from the session's active agent harness.
              // Spawn options are captured at tab-creation time so that
              // switching agents later doesn't disrupt a running terminal.
              const agentHarness = session.agentId
                ? harnesses.find((h) => h.agentId === session.agentId)
                : undefined;
              const spawnOptions: SpawnOptions | undefined =
                agentHarness?.useWsl
                  ? {
                      isWsl: true,
                      wslDistro: agentHarness.wslDistro || undefined,
                    }
                  : undefined;

              const effectivePath = session.path ?? project.path;

              return (
                <div
                  key={session.id}
                  className={isActive ? "absolute inset-0 flex" : "hidden"}
                >
                  {/* Chat + Terminal column */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Chat
                      sessionId={session.id}
                      projectId={project.id}
                      projectPath={effectivePath}
                      terminalOpen={isTerminalOpen}
                      onToggleTerminal={() =>
                        toggleTerminal(session.id, spawnOptions)
                      }
                    />
                    {isTerminalOpen && (
                      <TerminalPanel
                        projectPath={effectivePath}
                        tabs={terminalData!.tabs}
                        activeTabId={terminalData!.activeTabId}
                        onSelectTab={(tabId) => selectTab(session.id, tabId)}
                        onAddTab={() => addTab(session.id, spawnOptions)}
                        onCloseTab={(tabId) => closeTab(session.id, tabId)}
                        onRenameTab={(tabId, label) =>
                          renameTab(session.id, tabId, label)
                        }
                        onReorderTabs={(fromIndex, toIndex) =>
                          reorderTabs(session.id, fromIndex, toIndex)
                        }
                      />
                    )}
                  </div>

                  {/* Right sidebar — directory explorer per session */}
                  {isActive && (
                    <RightSidebar
                      isOpen={sessionSidebarOpen.has(session.id)}
                      onToggle={() => toggleSidebar(session.id)}
                      activeTab={sessionSidebarTab.get(session.id) ?? "explorer"}
                      onTabChange={(tab: string) => setSessionTab(session.id, tab)}
                      projectPath={effectivePath}
                      projectName={project.name}
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ProjectStoreProvider>
      <MessageStoreProvider>
        <SessionStatusStoreProvider>
          <AppLayout />
        </SessionStatusStoreProvider>
      </MessageStoreProvider>
    </ProjectStoreProvider>
  );
}

export default App;
