import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TerminalView } from "./terminal";
import type { TerminalTab } from "@/App";

// ── Context menu types ──────────────────────────────────────────────

interface ContextMenuState {
  tabId: string;
  tabLabel: string;
  x: number;
  y: number;
}

// ── Props ───────────────────────────────────────────────────────────

interface TerminalPanelProps {
  projectPath?: string;
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, label: string) => void;
}

// ── Component ───────────────────────────────────────────────────────

export function TerminalPanel({
  projectPath,
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // ── Drag-to-resize ─────────────────────────────────────────────────

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

  // ── Horizontal scroll with mouse wheel on tab bar ──────────────────

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // ── Auto-scroll active tab into view ───────────────────────────────

  useEffect(() => {
    if (!activeTabId || !tabBarRef.current) return;
    const activeTab = tabBarRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`,
    ) as HTMLElement | null;
    activeTab?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeTabId]);

  // ── Context menu ───────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTab) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        tabId: tab.id,
        tabLabel: tab.label,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [],
  );

  // Dismiss context menu on any outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;

    const dismiss = () => setContextMenu(null);

    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", dismiss, true);

    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [contextMenu]);

  const handleContextRename = useCallback(() => {
    if (!contextMenu) return;
    setRenamingTabId(contextMenu.tabId);
    setRenameValue(contextMenu.tabLabel);
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextClose = useCallback(() => {
    if (!contextMenu) return;
    onCloseTab(contextMenu.tabId);
    setContextMenu(null);
  }, [contextMenu, onCloseTab]);

  // ── Rename ─────────────────────────────────────────────────────────

  // Auto-focus and select the rename input when it appears
  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  const confirmRename = useCallback(() => {
    if (renamingTabId) {
      const trimmed = renameValue.trim();
      if (trimmed) {
        onRenameTab(renamingTabId, trimmed);
      }
      setRenamingTabId(null);
    }
  }, [renamingTabId, renameValue, onRenameTab]);

  const cancelRename = useCallback(() => {
    setRenamingTabId(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

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
      <div className="flex shrink-0 items-center px-2 pb-1.5 pt-1">
        <div
          ref={tabBarRef}
          data-tab-bar-scroll
          className="flex items-center gap-1 overflow-x-auto"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <style>{`
            [data-tab-bar-scroll]::-webkit-scrollbar { display: none; }
          `}</style>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isRenaming = renamingTabId === tab.id;

            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                type="button"
                onClick={() => {
                  if (!isRenaming) onSelectTab(tab.id);
                }}
                onContextMenu={(e) => handleContextMenu(e, tab)}
                className={cn(
                  "group/tab relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all select-none",
                  isActive
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={confirmRename}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                    className="w-24 rounded-sm bg-transparent px-0.5 text-[11px] font-medium text-foreground outline-none ring-1 ring-ring"
                  />
                ) : (
                  <span>{tab.label}</span>
                )}
                {!isRenaming && (
                  <span
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className={cn(
                      "inline-flex size-4 items-center justify-center rounded-sm transition-all",
                      "opacity-0 group-hover/tab:opacity-100 hover:bg-foreground/10",
                    )}
                    aria-label={`Close ${tab.label}`}
                  >
                    <X className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onAddTab}
          className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-muted/40 hover:text-foreground"
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

      {/* Context menu — rendered via portal so it floats above everything */}
      {contextMenu &&
        createPortal(
          <div
            // Capture the pointer-down before the document listener so the
            // menu item fires instead of the dismiss handler.
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[9999] min-w-[140px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={handleContextRename}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="size-3 text-muted-foreground" />
              Rename
            </button>
            <button
              type="button"
              onClick={handleContextClose}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3" />
              Close
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
