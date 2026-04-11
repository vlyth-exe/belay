import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";
import { ProjectWelcome } from "@/components/project/project-welcome";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { ProjectStoreProvider, useProjectStore } from "@/stores/project-store";

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

  // ── Main layout (sidebar + per-project chat) ───────────────────────
  return (
    <div
      id="app-container"
      className="flex h-screen w-screen flex-col bg-background"
    >
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ProjectSidebar />

        {/* Chat area — render all open chats but only show the active one */}
        <div className="relative min-w-0 flex-1">
          {openProjects.map((project) => (
            <div
              key={project.id}
              className={
                project.id === activeProjectId
                  ? "absolute inset-0 flex flex-col"
                  : "hidden"
              }
            >
              <Chat projectPath={project.path} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ProjectStoreProvider>
      <AppLayout />
    </ProjectStoreProvider>
  );
}

export default App;
