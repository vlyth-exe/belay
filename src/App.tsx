import { useEffect, useState, useCallback, useRef } from "react";
import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";
import { ProjectWelcome } from "@/components/project/project-welcome";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ProjectStoreProvider, useProjectStore } from "@/stores/project-store";
import { MessageStoreProvider } from "@/stores/message-store";
import { SessionStatusStoreProvider } from "@/stores/session-status-store";

// ── Terminal tab types ──────────────────────────────────────────────

export interface TerminalTab {
  id: string;
  label: string;
}

interface SessionTerminals {
  tabs: TerminalTab[];
  activeTabId: string;
  nextLabel: number;
}

function createInitialTab(): { tab: TerminalTab; nextLabel: number } {
  const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { tab: { id: tabId, label: "Terminal 1" }, nextLabel: 2 };
}

function createNextTab(counter: number): {
  tab: TerminalTab;
  nextLabel: number;
} {
  const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    tab: { id: tabId, label: `Terminal ${counter}` },
    nextLabel: counter + 1,
  };
}

function AppLayout() {
  const { openProjects, activeProjectId, setActiveProject, setActiveSession } =
    useProjectStore();

  // ── Terminal state: multiple tabs per session ─────────────────────
  const [sessionTerminals, setSessionTerminals] = useState<
    Map<string, SessionTerminals>
  >(new Map());
  const sessionTerminalsRef = useRef<Map<string, SessionTerminals>>(new Map());

  const syncRef = (next: Map<string, SessionTerminals>) => {
    sessionTerminalsRef.current = next;
    return next;
  };

  /** Toggle terminal panel for a session. If panel is closed, open with
   *  one tab. If panel is already open, add a new tab. */
  const toggleTerminal = useCallback((sessionId: string) => {
    setSessionTerminals((prev) => {
      const next = new Map(prev);
      const existing = next.get(sessionId);

      if (!existing || existing.tabs.length === 0) {
        // Open panel with first tab
        const { tab, nextLabel } = createInitialTab();
        next.set(sessionId, {
          tabs: [tab],
          activeTabId: tab.id,
          nextLabel,
        });
      } else {
        // Add a new tab and make it active
        const { tab, nextLabel } = createNextTab(existing.nextLabel);
        next.set(sessionId, {
          tabs: [...existing.tabs, tab],
          activeTabId: tab.id,
          nextLabel,
        });
      }

      return syncRef(next);
    });
  }, []);

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

  // Kill terminal processes for sessions that no longer exist
  useEffect(() => {
    const currentSessionIds = new Set(
      openProjects.flatMap((p) => p.sessions.map((s) => s.id)),
    );
    let changed = false;
    const next = new Map(sessionTerminalsRef.current);
    for (const [sessionId, data] of next) {
      if (!currentSessionIds.has(sessionId)) {
        data.tabs.forEach((t) => window.electronAPI?.terminalKill(t.id));
        next.delete(sessionId);
        changed = true;
      }
    }
    if (changed) {
      sessionTerminalsRef.current = next;
      setSessionTerminals(next);
    }
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

  return (
    <div
      id="app-container"
      className="flex h-screen w-screen flex-col bg-background"
    >
      <TitleBar />
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

              return (
                <div
                  key={session.id}
                  className={
                    isActive ? "absolute inset-0 flex flex-col" : "hidden"
                  }
                >
                  <Chat
                    sessionId={session.id}
                    projectId={project.id}
                    projectPath={project.path}
                    terminalOpen={isTerminalOpen}
                    onToggleTerminal={() => toggleTerminal(session.id)}
                  />
                  {isTerminalOpen && (
                    <TerminalPanel
                      projectPath={project.path}
                      tabs={terminalData!.tabs}
                      activeTabId={terminalData!.activeTabId}
                      onSelectTab={(tabId) => selectTab(session.id, tabId)}
                      onAddTab={() => toggleTerminal(session.id)}
                      onCloseTab={(tabId) => closeTab(session.id, tabId)}
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
