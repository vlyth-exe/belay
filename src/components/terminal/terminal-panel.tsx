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
        <div className="h-[3px] w-8 rounded-full bg-border transition-colors group-hover:bg-foreground/30" />
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-border bg-muted/30">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1.5 border-r border-border px-2.5 py-1 text-xs cursor-pointer select-none",
              tab.id === activeTabId
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() => onSelectTab(tab.id)}
          >
            <span>{tab.label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-sm transition-colors",
                tab.id === activeTabId
                  ? "opacity-0 group-hover:opacity-100 hover:bg-muted"
                  : "opacity-0 group-hover:opacity-100 hover:bg-muted/80",
              )}
              aria-label={`Close ${tab.label}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddTab}
          className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
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
            className={tab.id === activeTabId ? "absolute inset-0" : "hidden"}
          >
            <TerminalView
              id={tab.id}
              cwd={projectPath}
              onClose={() => onCloseTab(tab.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
