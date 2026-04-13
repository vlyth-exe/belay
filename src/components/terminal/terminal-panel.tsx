import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TerminalView } from "./terminal";
import type { TerminalTab } from "@/App";

interface TerminalPanelProps {
  projectPath?: string;
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
}

export function TerminalPanel({
  projectPath,
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setHeight(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className={cn(
        "flex flex-col border-t border-border bg-background",
        isDragging && "select-none",
      )}
      style={{ height: `${height}px` }}
    >
      {/* Drag handle */}
      <div
        className="group relative flex h-1 shrink-0 cursor-row-resize items-center justify-center hover:bg-muted/50"
        onMouseDown={handleDragStart}
      >
        <div className="h-0.75 w-8 rounded-full bg-border transition-colors group-hover:bg-foreground/30" />
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1.5 pt-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                "group/tab relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all select-none",
                isActive
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <span>{tab.label}</span>
              <span
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded-sm transition-all",
                  isActive
                    ? "opacity-0 group-hover/tab:opacity-100 hover:bg-foreground/10"
                    : "opacity-0 group-hover/tab:opacity-100 hover:bg-foreground/10",
                )}
                aria-label={`Close ${tab.label}`}
              >
                <X className="size-2.5" />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddTab}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-muted/40 hover:text-foreground"
          aria-label="Open new terminal"
          title="Open new terminal"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Terminal content — render all tabs, show only the active one */}
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={
              tab.id === activeTabId ? "absolute inset-0 p-2" : "hidden p-2"
            }
          >
            <TerminalView
              id={tab.id}
              cwd={projectPath}
              onClose={() => onCloseTab(tab.id)}
              spawnOptions={tab.spawnOptions}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
