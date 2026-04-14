import { useState, useCallback } from "react";
import { FolderOpen, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import belayIcon from "/Belay.svg";
import { useProjectStore } from "@/stores/project-store";

interface ProjectWelcomeProps {
  /** Called after a project is successfully opened. */
  onProjectOpened?: () => void;
}

export function ProjectWelcome({ onProjectOpened }: ProjectWelcomeProps) {
  const [isOpening, setIsOpening] = useState(false);
  const { openProject } = useProjectStore();

  const handleOpenDirectory = useCallback(async () => {
    setIsOpening(true);
    try {
      const selectedPath = await window.electronAPI?.projectOpenDirectory();
      if (selectedPath) {
        openProject(selectedPath);
        onProjectOpened?.();
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    } finally {
      setIsOpening(false);
    }
  }, [openProject, onProjectOpened]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      {/* Logo & tagline */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <img src={belayIcon} alt="Belay" className="size-10 dark:invert" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome to Belay
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Open a project folder to start chatting with your AI coding agent.
            Each project gets its own dedicated conversation.
          </p>
        </div>
      </div>

      {/* Open project button */}
      <Button
        size="lg"
        onClick={handleOpenDirectory}
        disabled={isOpening}
        className="gap-2 px-6"
      >
        {isOpening ? (
          <>
            <Clock className="size-4 animate-spin" />
            Opening…
          </>
        ) : (
          <>
            <FolderOpen className="size-4" />
            Open Project
          </>
        )}
      </Button>

      {/* Secondary hint */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
          <Plus className="size-3" />
          <span>Select a folder to begin</span>
        </div>
      </div>
    </div>
  );
}
