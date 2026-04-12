import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";
import { ProjectWelcome } from "@/components/project/project-welcome";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { ProjectStoreProvider, useProjectStore } from "@/stores/project-store";
import { MessageStoreProvider } from "@/stores/message-store";
import { SessionStatusStoreProvider } from "@/stores/session-status-store";

function AppLayout() {
  const { openProjects, activeProjectId } = useProjectStore();

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
            project.sessions.map((session) => (
              <div
                key={session.id}
                className={
                  session.id === activeSessionId &&
                  project.id === activeProjectId
                    ? "absolute inset-0 flex flex-col"
                    : "hidden"
                }
              >
                <Chat
                  sessionId={session.id}
                  projectId={project.id}
                  projectPath={project.path}
                />
              </div>
            )),
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
