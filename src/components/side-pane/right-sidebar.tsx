import { useState, useCallback, useEffect } from "react";
import { PanelRightOpen, PanelRightClose, FolderTree } from "lucide-react";
import { FileExplorer } from "@/components/file-explorer/file-explorer";

// ── Persistence ──────────────────────────────────────────────────────

const SIDEBAR_STATE_KEY = "belay:rightSidebar:open";

function loadSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_STATE_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

function persistSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, String(open));
  } catch {
    // Ignore storage errors
  }
}

// ── Types ────────────────────────────────────────────────────────────

export interface RightSidebarProps {
  /** The project root path to explore. If undefined, no explorer is shown. */
  projectPath?: string;
  /** Project display name for the header. */
  projectName?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 36;

// ── RightSidebar component ───────────────────────────────────────────

export function RightSidebar({ projectPath, projectName }: RightSidebarProps) {
  const [isOpen, setIsOpen] = useState(loadSidebarOpen);
  const [animating, setAnimating] = useState(false);

  // Persist open/closed state
  useEffect(() => {
    persistSidebarOpen(isOpen);
  }, [isOpen]);

  const toggle = useCallback(() => {
    setAnimating(true);
    setIsOpen((prev) => !prev);
  }, []);

  // Clear animating flag after transition
  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 200);
    return () => clearTimeout(timer);
  }, [animating]);

  return (
    <div
      className="flex h-full shrink-0 overflow-hidden border-l border-border/40 transition-[width] duration-200 ease-in-out"
      style={{ width: isOpen ? SIDEBAR_WIDTH : COLLAPSED_WIDTH }}
    >
      {/* ── Collapse/expand toggle strip ── */}
      <div
        className={[
          "flex shrink-0 flex-col items-center pt-1",
          isOpen ? "w-0 overflow-hidden" : "w-full",
        ].join(" ")}
        style={{ width: isOpen ? 0 : COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={toggle}
          className={[
            "inline-flex size-7 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
          ].join(" ")}
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <PanelRightOpen className="size-4" />
        </button>

        {/* Rotated label when collapsed */}
        {!isOpen && (
          <div className="mt-3 flex flex-col items-center">
            <button
              type="button"
              onClick={toggle}
              className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 [writing-mode:vertical-rl] hover:text-foreground"
            >
              Explorer
            </button>
          </div>
        )}
      </div>

      {/* ── Sidebar content panel ── */}
      <div
        className={[
          "flex min-w-0 flex-1 flex-col overflow-hidden bg-background/50",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          "transition-opacity duration-200",
        ].join(" ")}
      >
        {/* Header bar with collapse button and title */}
        <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5">
          <FolderTree className="size-3.5 text-muted-foreground/70" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Explorer
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={toggle}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelRightClose className="size-3.5" />
          </button>
        </div>

        {/* Directory explorer content */}
        <div className="flex-1 overflow-hidden">
          {projectPath ? (
            <FileExplorer
              rootPath={projectPath}
              rootLabel={projectName}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <FolderTree className="size-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/50">
                No project path available
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
