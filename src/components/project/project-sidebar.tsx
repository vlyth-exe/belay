import { useState, useCallback } from "react";
import {
  FolderOpen,
  X,
  Plus,
  MessageSquare,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";

export function ProjectSidebar() {
  const [isOpening, setIsOpening] = useState(false);
  const { openProjects, activeProjectId, setActiveProject, closeProject, openProject } =
    useProjectStore();

  const handleOpenDirectory = useCallback(async () => {
    setIsOpening(true);
    try {
      const selectedPath = await window.electronAPI?.projectOpenDirectory();
      if (selectedPath) {
        openProject(selectedPath);
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    } finally {
      setIsOpening(false);
    }
  }, [openProject]);

  const handleCloseProject = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation(); // Prevent selecting the project when clicking close
      closeProject(projectId);
    },
    [closeProject],
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-background/50">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
          Projects
        </span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {openProjects.length}
        </span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {openProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <FolderOpen className="size-5 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground/60">
              No projects open
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 px-1.5">
            {openProjects.map((project) => {
              const isActive = project.id === activeProjectId;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setActiveProject(project.id)}
                  className={[
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  ].join(" ")}
                >
                  {/* Folder icon */}
                  <FolderOpen
                    className={[
                      "size-3.5 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground/60",
                    ].join(" ")}
                  />

                  {/* Project name & path */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium leading-tight">
                      {project.name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground/60 leading-tight">
                      {project.path}
                    </div>
                  </div>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={(e) => handleCloseProject(e, project.id)}
                    className={[
                      "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                      isActive
                        ? "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                        : "text-transparent group-hover:text-muted-foreground hover:!bg-muted-foreground/10 hover:!text-foreground",
                    ].join(" ")}
                    aria-label={`Close ${project.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Open project button */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenDirectory}
          disabled={isOpening}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          {isOpening ? (
            <>
              <Clock className="size-3.5 animate-spin" />
              <span className="text-[12px]">Opening…</span>
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              <span className="text-[12px]">Open Project</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
