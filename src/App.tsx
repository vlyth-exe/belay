import { useEffect, useState, useCallback, useRef } from "react";
import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";
import { ProjectWelcome } from "@/components/project/project-welcome";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ProjectStoreProvider, useProjectStore } from "@/stores/project-store";
import { MessageStoreProvider } from "@/stores/message-store";
import { SessionStatusStoreProvider } from "@/stores/session-status-store";

function AppLayout() {
  const { openProjects, activeProjectId, setActiveProject, setActiveSession } =
    useProjectStore();

  // ── Terminal state: which sessions have an open terminal ──────────
  const [openTerminals, setOpenTerminals] = useState<Set<string>>(new Set());
  const openTerminalsRef = useRef<Set<string>>(new Set());

  const toggleTerminal = useCallback((sessionId: string) => {
    setOpenTerminals((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        window.electronAPI?.terminalKill(sessionId);
      } else {
        next.add(sessionId);
      }
      openTerminalsRef.current = next;
      return next;
    });
  }, []);

  const closeTerminal = useCallback((sessionId: string) => {
    setOpenTerminals((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      window.electronAPI?.terminalKill(sessionId);
      openTerminalsRef.current = next;
      return next;
    });
  }, []);

  // Kill terminal processes for sessions that no longer exist
  useEffect(() => {
    const currentSessionIds = new Set(
      openProjects.flatMap((p) => p.sessions.map((s) => s.id)),
    );
    const stale = [...openTerminalsRef.current].filter(
      (id) => !currentSessionIds.has(id),
    );
    if (stale.length === 0) return;
    const next = new Set(openTerminalsRef.current);
    stale.forEach((id) => {
      next.delete(id);
      window.electronAPI?.terminalKill(id);
    });
    openTerminalsRef.current = next;
    setOpenTerminals(next);
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
              const isTerminalOpen = openTerminals.has(session.id);

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
                  <TerminalPanel
                    sessionId={session.id}
                    projectPath={project.path}
                    isOpen={isTerminalOpen}
                    onClose={() => closeTerminal(session.id)}
                  />
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
