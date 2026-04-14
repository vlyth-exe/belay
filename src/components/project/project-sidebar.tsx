import { useState, useCallback, useRef, useEffect } from "react";
import {
  FolderOpen,
  X,
  Plus,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Loader2,
  Circle,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";
import { useSessionStatusRead } from "@/stores/session-status-store";
import { GroupDialog } from "./group-dialog";
import { HarnessRegistryDialog } from "@/components/harness/harness-registry-dialog";
import type { Project } from "@/types/project";

// ── Persisted expanded state ─────────────────────────────────────────

const EXPANDED_STORAGE_KEY = "belay-expanded-projects";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Ignore corrupt data
  }
  return new Set();
}

function persistExpanded(set: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Ignore quota errors
  }
}

// ── Drag and drop types ────────────────────────────────────────────

interface DragInfo {
  kind: "project" | "session" | "group";
  id: string;
  projectId?: string;
}

interface DropIndicator {
  kind: "project" | "session" | "group" | "ungroup" | "layout";
  targetId: string;
  position: "before" | "after";
}

// ── Context menu types ─────────────────────────────────────────────

type ContextMenuTarget =
  | { kind: "project"; projectId: string }
  | { kind: "session"; projectId: string; sessionId: string }
  | { kind: "group"; projectId: string; groupId: string };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

// ── Group dialog state ─────────────────────────────────────────────

interface GroupDialogConfig {
  mode: "create" | "edit";
  projectId: string;
  groupId?: string;
  initialName: string;
  initialColor: string;
  initialSessionIds?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function findGroupForSession(project: Project, sessionId: string) {
  return project.groups.find((g) => g.sessionIds.includes(sessionId));
}

// ── Component ───────────────────────────────────────────────────────

export function ProjectSidebar() {
  const [isOpening, setIsOpening] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.appVersion().then(setAppVersion).catch(() => {});
  }, []);
  const [expandedProjects, setExpandedProjects] =
    useState<Set<string>>(loadExpanded);

  // Drag state
  const dragInfoRef = useRef<DragInfo | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  const dropIndicatorRef = useRef<DropIndicator | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Group dialog state — openKey increments each time so the inner form
  // remounts with fresh initial values.
  const [groupDialog, setGroupDialog] = useState<GroupDialogConfig | null>(
    null,
  );
  const [groupDialogKey, setGroupDialogKey] = useState(0);
  const [showRegistry, setShowRegistry] = useState(false);

  // Inline rename state for sessions
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );

  // Session status read (re-renders sidebar when any status changes)
  const { getStatus } = useSessionStatusRead();

  function setDrop(indicator: DropIndicator | null) {
    dropIndicatorRef.current = indicator;
    setDropIndicator(indicator);
  }

  // ── Store bindings ───────────────────────────────────────────────

  const {
    openProjects,
    activeProjectId,
    setActiveProject,
    closeProject,
    openProject,
    addSession,
    removeSession,
    setActiveSession,
    renameSession,
    pathToId,
    reorderProjects,
    createGroup,
    deleteGroup,
    renameGroup,
    setGroupColor,
    addSessionToGroup,
    removeSessionFromGroup,
    toggleGroupCollapsed,
    reorderGroupSessions,
    reorderLayout,
    ungroupSessionAtPosition,
  } = useProjectStore();

  // ── Context menu helpers ─────────────────────────────────────────

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target: ContextMenuTarget) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, target });
    },
    [],
  );

  // Close context menu on scroll / resize / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = closeContextMenu;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu, closeContextMenu]);

  // ── Group dialog helpers ─────────────────────────────────────────

  const openCreateGroupDialog = useCallback(
    (projectId: string, initialSessionIds?: string[]) => {
      setGroupDialogKey((k) => k + 1);
      setGroupDialog({
        mode: "create",
        projectId,
        initialName: "",
        initialColor: "#3b82f6",
        initialSessionIds,
      });
    },
    [],
  );

  const openEditGroupDialog = useCallback(
    (projectId: string, groupId: string, name: string, color: string) => {
      setGroupDialogKey((k) => k + 1);
      setGroupDialog({
        mode: "edit",
        projectId,
        groupId,
        initialName: name,
        initialColor: color,
      });
    },
    [],
  );

  const handleGroupDialogSubmit = useCallback(
    (data: { name: string; color: string }) => {
      if (!groupDialog) return;
      if (groupDialog.mode === "create") {
        createGroup(
          groupDialog.projectId,
          data.name,
          data.color,
          groupDialog.initialSessionIds,
        );
      } else if (groupDialog.groupId) {
        renameGroup(groupDialog.projectId, groupDialog.groupId, data.name);
        setGroupColor(groupDialog.projectId, groupDialog.groupId, data.color);
      }
      setGroupDialog(null);
    },
    [groupDialog, createGroup, renameGroup, setGroupColor],
  );

  // ── Directory / project handlers ─────────────────────────────────

  const handleOpenDirectory = useCallback(async () => {
    setIsOpening(true);
    try {
      const selectedPath = await window.electronAPI?.projectOpenDirectory();
      if (selectedPath) {
        openProject(selectedPath);
        // Auto-expand the newly opened project
        const id = pathToId(selectedPath);
        setExpandedProjects((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          persistExpanded(next);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    } finally {
      setIsOpening(false);
    }
  }, [openProject, pathToId]);

  const handleCloseProject = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      closeProject(projectId);
    },
    [closeProject],
  );

  const handleCloseSession = useCallback(
    (e: React.MouseEvent, projectId: string, sessionId: string) => {
      e.stopPropagation();
      removeSession(projectId, sessionId);
    },
    [removeSession],
  );

  const toggleExpanded = useCallback(
    (projectId: string, canCollapse: boolean) => {
      setExpandedProjects((prev) => {
        // Don't allow collapsing when locked (active project with open session)
        if (prev.has(projectId) && !canCollapse) return prev;
        const next = new Set(prev);
        if (next.has(projectId)) {
          next.delete(projectId);
        } else {
          next.add(projectId);
        }
        persistExpanded(next);
        return next;
      });
    },
    [],
  );

  const handleProjectClick = useCallback(
    (projectId: string) => {
      setActiveProject(projectId);
      // Auto-expand when selecting a project
      setExpandedProjects((prev) => {
        if (prev.has(projectId)) return prev;
        const next = new Set(prev);
        next.add(projectId);
        persistExpanded(next);
        return next;
      });
    },
    [setActiveProject],
  );

  const handleNewSession = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      addSession(projectId);
    },
    [addSession],
  );

  // ── Drag and drop (container-level handlers using closest()) ────

  function handleDragEnd() {
    dragInfoRef.current = null;
    setDrop(null);
  }

  // ── Project list container handlers ─────────────────────────────

  function handleProjectListDragStart(e: React.DragEvent) {
    const sessionEl = (e.target as Element).closest("[data-session-id]");
    if (sessionEl) return; // session drag — ignore in project container
    const el = (e.target as Element).closest("[data-project-id]");
    if (!el) return;
    const id = (el as HTMLElement).dataset.projectId!;
    e.dataTransfer.effectAllowed = "move";
    dragInfoRef.current = { kind: "project", id };
    setDrop(null);
  }

  function handleProjectListDragOver(e: React.DragEvent) {
    const d = dragInfoRef.current;
    if (!d || d.kind !== "project") return;
    // Never treat a session area as a project drop target
    if ((e.target as Element).closest("[data-session-id]")) return;
    const el = (e.target as Element).closest("[data-project-id]");
    if (!el) return;
    const targetId = (el as HTMLElement).dataset.projectId!;
    if (targetId === d.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = el.getBoundingClientRect();
    setDrop({
      kind: "project",
      targetId,
      position: e.clientY < rect.top + rect.height / 2 ? "before" : "after",
    });
  }

  function handleProjectListDrop(e: React.DragEvent) {
    e.preventDefault();
    const d = dragInfoRef.current;
    const t = dropIndicatorRef.current;
    if (!d || d.kind !== "project" || !t) return;
    const ids = openProjects.map((p) => p.id);
    const without = ids.filter((id) => id !== d.id);
    const idx = without.indexOf(t.targetId);
    if (idx === -1) return;
    without.splice(t.position === "after" ? idx + 1 : idx, 0, d.id);
    reorderProjects(without);
    dragInfoRef.current = null;
    setDrop(null);
  }

  // ── Session list container handlers ─────────────────────────────

  function handleSessionListDragStart(e: React.DragEvent, projectId: string) {
    e.stopPropagation();
    const sessionEl = (e.target as Element).closest("[data-session-id]");
    if (sessionEl) {
      const id = (sessionEl as HTMLElement).dataset.sessionId!;
      e.dataTransfer.effectAllowed = "move";
      dragInfoRef.current = { kind: "session", id, projectId };
      setDrop(null);
      return;
    }
    const groupEl = (e.target as Element).closest("[data-group-id]");
    if (groupEl) {
      const id = (groupEl as HTMLElement).dataset.groupId!;
      e.dataTransfer.effectAllowed = "move";
      dragInfoRef.current = { kind: "group", id, projectId };
      setDrop(null);
    }
  }

  function handleSessionListDragOver(e: React.DragEvent, projectId: string) {
    e.stopPropagation();
    const d = dragInfoRef.current;
    if (
      !d ||
      (d.kind !== "session" && d.kind !== "group") ||
      d.projectId !== projectId
    )
      return;
    const project = openProjects.find((p) => p.id === projectId);
    if (!project) return;

    const groupedSessionIds = new Set(
      project.groups.flatMap((g) => g.sessionIds),
    );

    // ── Group drag → reorder within layout ──
    if (d.kind === "group") {
      // Check for ungrouped session (layout target)
      const sessionEl = (e.target as Element).closest("[data-session-id]");
      if (sessionEl) {
        const targetId = (sessionEl as HTMLElement).dataset.sessionId!;
        if (!groupedSessionIds.has(targetId) && targetId !== d.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = sessionEl.getBoundingClientRect();
          setDrop({
            kind: "layout",
            targetId,
            position:
              e.clientY < rect.top + rect.height / 2 ? "before" : "after",
          });
        }
        return;
      }
      // Check for group header (layout target)
      const groupEl = (e.target as Element).closest("[data-group-id]");
      if (groupEl) {
        const targetId = (groupEl as HTMLElement).dataset.groupId!;
        if (targetId !== d.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = groupEl.getBoundingClientRect();
          setDrop({
            kind: "layout",
            targetId,
            position:
              e.clientY < rect.top + rect.height / 2 ? "before" : "after",
          });
        }
        return;
      }
      // Empty space → snap to last layout item
      const lastId = project.layout[project.layout.length - 1];
      if (lastId && lastId !== d.id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDrop({ kind: "layout", targetId: lastId, position: "after" });
      }
      return;
    }

    // ── Session drag ──
    const sessionEl = (e.target as Element).closest("[data-session-id]");
    if (sessionEl) {
      const targetId = (sessionEl as HTMLElement).dataset.sessionId!;
      if (targetId === d.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = sessionEl.getBoundingClientRect();
      const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
      if (groupedSessionIds.has(targetId)) {
        // Grouped session → reorder within group
        setDrop({ kind: "session", targetId, position: pos });
      } else {
        // Ungrouped session → layout reorder
        setDrop({ kind: "layout", targetId, position: pos });
      }
      return;
    }

    // Group header → add session to group
    const groupEl = (e.target as Element).closest("[data-group-id]");
    if (groupEl) {
      const groupId = (groupEl as HTMLElement).dataset.groupId!;
      const group = project.groups.find((g) => g.id === groupId);
      if (group && !group.sessionIds.includes(d.id)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDrop({ kind: "group", targetId: groupId, position: "after" });
      }
      return;
    }

    // Empty space → snap to last layout item
    const lastId = project.layout[project.layout.length - 1];
    if (lastId && lastId !== d.id) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDrop({ kind: "layout", targetId: lastId, position: "after" });
    }
  }

  function handleSessionListDrop(e: React.DragEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    const d = dragInfoRef.current;
    const t = dropIndicatorRef.current;
    if (
      !d ||
      (d.kind !== "session" && d.kind !== "group") ||
      d.projectId !== projectId ||
      !t
    )
      return;

    const project = openProjects.find((p) => p.id === projectId);
    if (!project) return;

    // ── Layout reorder (groups and ungrouped sessions) ──
    if (t.kind === "layout") {
      const layout = project.layout.slice();

      if (d.kind === "group") {
        const idx = layout.indexOf(d.id);
        if (idx !== -1) layout.splice(idx, 1);
        const targetIdx = layout.indexOf(t.targetId);
        if (targetIdx !== -1) {
          layout.splice(
            t.position === "after" ? targetIdx + 1 : targetIdx,
            0,
            d.id,
          );
          reorderLayout(projectId, layout);
        }
      } else if (d.kind === "session") {
        const currentGroup = project.groups.find((g) =>
          g.sessionIds.includes(d.id),
        );
        const cleaned = layout.filter((id) => id !== d.id);
        const targetIdx = cleaned.indexOf(t.targetId);
        if (targetIdx !== -1) {
          cleaned.splice(
            t.position === "after" ? targetIdx + 1 : targetIdx,
            0,
            d.id,
          );
          if (currentGroup) {
            ungroupSessionAtPosition(projectId, d.id, cleaned);
          } else {
            reorderLayout(projectId, cleaned);
          }
        }
      }
      dragInfoRef.current = null;
      setDrop(null);
      return;
    }

    // Only session drags past this point
    if (d.kind !== "session") {
      dragInfoRef.current = null;
      setDrop(null);
      return;
    }

    // Drop onto a group header → add session to that group
    if (t.kind === "group") {
      addSessionToGroup(projectId, t.targetId, d.id);
      dragInfoRef.current = null;
      setDrop(null);
      return;
    }

    // Drop between grouped sessions → reorder within group
    if (t.kind === "session") {
      const targetGroup = project.groups.find((g) =>
        g.sessionIds.includes(t.targetId),
      );
      if (targetGroup) {
        const ids = targetGroup.sessionIds.filter((id) => id !== d.id);
        const idx = ids.indexOf(t.targetId);
        if (idx !== -1) {
          ids.splice(t.position === "after" ? idx + 1 : idx, 0, d.id);
          reorderGroupSessions(projectId, targetGroup.id, ids);
        }
      }
      dragInfoRef.current = null;
      setDrop(null);
      return;
    }

    dragInfoRef.current = null;
    setDrop(null);
  }

  function handleSessionListDragEnd() {
    dragInfoRef.current = null;
    setDrop(null);
  }

  // ── Render helpers ───────────────────────────────────────────────

  /** Render a status icon for a session. */
  function SessionStatusIcon({
    sessionId,
    isActive,
  }: {
    sessionId: string;
    isActive: boolean;
  }) {
    const status = getStatus(sessionId);
    const iconClass = [
      "size-3 shrink-0",
      isActive ? "text-primary" : "text-muted-foreground/50",
    ].join(" ");

    if (status === "running") {
      return <Loader2 className={[iconClass, "animate-spin"].join(" ")} />;
    }
    if (status === "unseen") {
      return (
        <Circle
          className="size-3 shrink-0 text-primary"
          fill="currentColor"
          strokeWidth={0}
        />
      );
    }
    return <MessageSquare className={iconClass} />;
  }

  /** Render a single session row. */
  function renderSession(
    session: { id: string; title: string },
    project: { id: string; activeSessionId: string | null; isActive: boolean },
    extraIndent = false,
  ) {
    const isSessionActive =
      project.isActive && session.id === project.activeSessionId;
    const isSessionDragging =
      dragInfoRef.current?.kind === "session" &&
      dragInfoRef.current.id === session.id;
    const isSessionDropBefore =
      dropIndicator?.kind === "session" &&
      dropIndicator.targetId === session.id &&
      dropIndicator.position === "before";
    const isSessionDropAfter =
      dropIndicator?.kind === "session" &&
      dropIndicator.targetId === session.id &&
      dropIndicator.position === "after";

    const indentClass = extraIndent ? "ml-3" : "";

    return (
      <div key={session.id} className={indentClass}>
        {isSessionDropBefore && (
          <div
            className={[
              "h-0.5 rounded-full bg-primary mb-0.5",
              extraIndent ? "-ml-3" : "-ml-2",
            ].join(" ")}
          />
        )}

        <button
          type="button"
          data-session-id={session.id}
          draggable
          onClick={() => setActiveSession(project.id, session.id)}
          onContextMenu={(e) =>
            handleContextMenu(e, {
              kind: "session",
              projectId: project.id,
              sessionId: session.id,
            })
          }
          style={isSessionDragging ? { opacity: 0.4 } : undefined}
          className={[
            "group/session flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors cursor-pointer",
            isSessionActive
              ? "bg-muted/70 text-foreground"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          ].join(" ")}
        >
          <SessionStatusIcon
            sessionId={session.id}
            isActive={isSessionActive}
          />

          {renamingSessionId === session.id ? (
            <input
              type="text"
              autoFocus
              defaultValue={session.title}
              className="min-w-0 flex-1 bg-transparent text-[12px] leading-tight text-foreground outline-none ring-1 ring-primary rounded px-1 -mx-1"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== session.title) {
                  renameSession(project.id, session.id, value);
                }
                setRenamingSessionId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value && value !== session.title) {
                    renameSession(project.id, session.id, value);
                  }
                  setRenamingSessionId(null);
                } else if (e.key === "Escape") {
                  setRenamingSessionId(null);
                }
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[12px] leading-tight">
              {session.title}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => handleCloseSession(e, project.id, session.id)}
            className={[
              "flex size-4 shrink-0 items-center justify-center rounded transition-colors",
              isSessionActive
                ? "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                : "text-transparent group-hover/session:text-muted-foreground hover:!bg-muted-foreground/10 hover:!text-foreground",
            ].join(" ")}
            aria-label={`Close ${session.title}`}
          >
            <X className="size-2.5" />
          </button>
        </button>

        {isSessionDropAfter && (
          <div
            className={[
              "h-0.5 rounded-full bg-primary mt-0.5",
              extraIndent ? "-ml-3" : "-ml-2",
            ].join(" ")}
          />
        )}
      </div>
    );
  }

  // ── Render context menu ──────────────────────────────────────────

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const { target } = contextMenu;

    const project = openProjects.find((p) =>
      "projectId" in target ? p.id === target.projectId : false,
    );

    // Clamp position so menu stays within viewport
    const menuX = Math.min(contextMenu.x, window.innerWidth - 200);
    const menuY = Math.min(contextMenu.y, window.innerHeight - 200);

    return (
      <>
        {/* Invisible overlay to detect clicks outside */}
        <div
          className="fixed inset-0 z-40"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        />
        <div
          className="fixed z-50 min-w-45 max-w-70 rounded-lg border border-border bg-background p-1 shadow-xl"
          style={{ left: menuX, top: menuY }}
        >
          {/* ── Project context menu ── */}
          {target.kind === "project" && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
              onClick={() => {
                openCreateGroupDialog(target.projectId);
                closeContextMenu();
              }}
            >
              <Plus className="size-3.5 shrink-0" />
              Create Group
            </button>
          )}

          {/* ── Session context menu ── */}
          {target.kind === "session" && project && (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  setRenamingSessionId(target.sessionId);
                  closeContextMenu();
                }}
              >
                <Pencil className="size-3.5 shrink-0" />
                Rename
              </button>

              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  openCreateGroupDialog(target.projectId, [target.sessionId]);
                  closeContextMenu();
                }}
              >
                <Plus className="size-3.5 shrink-0" />
                Create Group with Session
              </button>

              {/* Add to existing groups */}
              {project.groups.length > 0 && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <div className="px-2.5 py-1 text-[10px] font-medium text-muted-foreground uppercase">
                    Add to Group
                  </div>
                  {project.groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                      onClick={() => {
                        addSessionToGroup(
                          target.projectId,
                          g.id,
                          target.sessionId,
                        );
                        closeContextMenu();
                      }}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="truncate">{g.name}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Remove from current group */}
              {(() => {
                const currentGroup = findGroupForSession(
                  project,
                  target.sessionId,
                );
                if (!currentGroup) return null;
                return (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                      onClick={() => {
                        removeSessionFromGroup(
                          target.projectId,
                          currentGroup.id,
                          target.sessionId,
                        );
                        closeContextMenu();
                      }}
                    >
                      <X className="size-3.5 shrink-0" />
                      <span className="truncate">
                        Remove from &ldquo;{currentGroup.name}&rdquo;
                      </span>
                    </button>
                  </>
                );
              })()}
            </>
          )}

          {/* ── Group context menu ── */}
          {target.kind === "group" && project && (
            <>
              {(() => {
                const group = project.groups.find(
                  (g) => g.id === target.groupId,
                );
                if (!group) return null;
                return (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                      onClick={() => {
                        openEditGroupDialog(
                          target.projectId,
                          group.id,
                          group.name,
                          group.color,
                        );
                        closeContextMenu();
                      }}
                    >
                      <Pencil className="size-3.5 shrink-0" />
                      Rename / Edit Colour
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-destructive transition-colors hover:bg-destructive/10"
                      onClick={() => {
                        deleteGroup(target.projectId, target.groupId);
                        closeContextMenu();
                      }}
                    >
                      <Trash2 className="size-3.5 shrink-0" />
                      Delete Group
                    </button>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </>
    );
  };

  // ── Main render ──────────────────────────────────────────────────

  const query = searchQuery.toLowerCase().trim();
  const filteredProjects = query
    ? openProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.path.toLowerCase().includes(query) ||
          p.sessions.some((s) => s.title.toLowerCase().includes(query)),
      )
    : openProjects;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col">


      <div className="px-2 pt-1 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects…"
            className="h-7 w-full rounded-md border border-border/50 bg-muted/30 pl-6 pr-6 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <FolderOpen className="size-5 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground/60">
              {query ? "No matching projects" : "No projects open"}
            </p>
          </div>
        ) : (
          <div
            className="flex flex-col gap-0.5 px-1.5"
            onDragStart={handleProjectListDragStart}
            onDragOver={handleProjectListDragOver}
            onDrop={handleProjectListDrop}
            onDragEnd={handleDragEnd}
          >
            {filteredProjects.map((project) => {
              const isActive = project.id === activeProjectId;
              const isExpanded = query ? true : expandedProjects.has(project.id);
              const canCollapse = !(isActive && project.activeSessionId);
              const isDragging =
                dragInfoRef.current?.kind === "project" &&
                dragInfoRef.current.id === project.id;
              const isDropBefore =
                dropIndicator?.kind === "project" &&
                dropIndicator.targetId === project.id &&
                dropIndicator.position === "before";
              const isDropAfter =
                dropIndicator?.kind === "project" &&
                dropIndicator.targetId === project.id &&
                dropIndicator.position === "after";

              const groupedSessionIds = new Set(
                project.groups.flatMap((g) => g.sessionIds),
              );

              return (
                <div key={project.id}>
                  {/* ── Project row ── */}
                  <button
                    type="button"
                    data-project-id={project.id}
                    draggable
                    onClick={() => handleProjectClick(project.id)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, {
                        kind: "project",
                        projectId: project.id,
                      })
                    }
                    style={isDragging ? { opacity: 0.4 } : undefined}
                    className={[
                      "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      isDropBefore
                        ? "border-t-2 border-primary rounded-t-none"
                        : "",
                      isDropAfter
                        ? "border-b-2 border-primary rounded-b-none"
                        : "",
                    ].join(" ")}
                  >
                    {/* Expand chevron */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(project.id, canCollapse);
                      }}
                      className={[
                        "flex size-4 shrink-0 items-center justify-center rounded transition-colors",
                        !canCollapse && isExpanded
                          ? "text-muted-foreground/25 cursor-default"
                          : "text-muted-foreground/60 hover:text-foreground",
                      ].join(" ")}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                    </button>

                    {/* Folder icon */}
                    <FolderOpen
                      className={[
                        "size-3.5 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground/60",
                      ].join(" ")}
                    />

                    {/* Project name */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium leading-tight">
                        {project.name}
                      </div>
                    </div>

                    {/* New chat button */}
                    {isActive && (
                      <button
                        type="button"
                        onClick={(e) => handleNewSession(e, project.id)}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
                        aria-label="New chat"
                      >
                        <Plus className="size-3" />
                      </button>
                    )}

                    {/* Close project button */}
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

                  {/* ── Session sub-items ── */}
                  {isExpanded && (
                    <div
                      className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border/40 pl-2"
                      onDragStart={(e) =>
                        handleSessionListDragStart(e, project.id)
                      }
                      onDragOver={(e) =>
                        handleSessionListDragOver(e, project.id)
                      }
                      onDrop={(e) => handleSessionListDrop(e, project.id)}
                      onDragEnd={handleSessionListDragEnd}
                    >
                      {/* ── Layout items (groups and ungrouped sessions in order) ── */}
                      {project.layout.map((id) => {
                        // Check if this layout item is a group
                        const group = project.groups.find((g) => g.id === id);
                        if (group) {
                          const groupSessions = group.sessionIds
                            .map((sid) =>
                              project.sessions.find((s) => s.id === sid),
                            )
                            .filter(
                              (s): s is NonNullable<typeof s> =>
                                s !== undefined,
                            );

                          const isGroupDropTarget =
                            dropIndicator?.kind === "group" &&
                            dropIndicator.targetId === group.id;
                          const isGroupDragging =
                            dragInfoRef.current?.kind === "group" &&
                            dragInfoRef.current.id === group.id;
                          const isLayoutDropBefore =
                            dropIndicator?.kind === "layout" &&
                            dropIndicator.targetId === group.id &&
                            dropIndicator.position === "before";
                          const isLayoutDropAfter =
                            dropIndicator?.kind === "layout" &&
                            dropIndicator.targetId === group.id &&
                            dropIndicator.position === "after";

                          return (
                            <div
                              key={group.id}
                              className="mt-0.5"
                              style={
                                isGroupDragging ? { opacity: 0.4 } : undefined
                              }
                            >
                              <button
                                type="button"
                                data-group-id={group.id}
                                draggable
                                onClick={() =>
                                  toggleGroupCollapsed(project.id, group.id)
                                }
                                onContextMenu={(e) =>
                                  handleContextMenu(e, {
                                    kind: "group",
                                    projectId: project.id,
                                    groupId: group.id,
                                  })
                                }
                                className={[
                                  "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors cursor-pointer",
                                  isGroupDropTarget
                                    ? "ring-2 ring-primary/60 bg-primary/10"
                                    : isLayoutDropBefore
                                      ? "border-t-2 border-primary rounded-t-none"
                                      : isLayoutDropAfter
                                        ? "border-b-2 border-primary rounded-b-none"
                                        : "hover:bg-muted/40",
                                ].join(" ")}
                              >
                                {group.collapsed ? (
                                  <ChevronRight className="size-2.5 shrink-0 text-muted-foreground/60" />
                                ) : (
                                  <ChevronDown className="size-2.5 shrink-0 text-muted-foreground/60" />
                                )}
                                <span
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: group.color }}
                                />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-muted-foreground">
                                  {group.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                                  {groupSessions.length}
                                </span>
                              </button>

                              {/* Group sessions (visible when not collapsed) */}
                              {!group.collapsed &&
                                groupSessions.map((session) =>
                                  renderSession(
                                    session,
                                    {
                                      id: project.id,
                                      activeSessionId: project.activeSessionId,
                                      isActive,
                                    },
                                    /* extraIndent */ true,
                                  ),
                                )}
                            </div>
                          );
                        }

                        // Check if this layout item is an ungrouped session
                        const session = project.sessions.find(
                          (s) => s.id === id,
                        );
                        if (session && !groupedSessionIds.has(id)) {
                          const isSessionActive =
                            isActive && session.id === project.activeSessionId;
                          const isSessionDragging =
                            dragInfoRef.current?.kind === "session" &&
                            dragInfoRef.current.id === session.id;
                          const isLayoutDropBefore =
                            dropIndicator?.kind === "layout" &&
                            dropIndicator.targetId === session.id &&
                            dropIndicator.position === "before";
                          const isLayoutDropAfter =
                            dropIndicator?.kind === "layout" &&
                            dropIndicator.targetId === session.id &&
                            dropIndicator.position === "after";

                          return (
                            <div
                              key={session.id}
                              style={
                                isSessionDragging ? { opacity: 0.4 } : undefined
                              }
                              className={[
                                isLayoutDropBefore
                                  ? "border-t-2 border-primary"
                                  : "",
                                isLayoutDropAfter
                                  ? "border-b-2 border-primary"
                                  : "",
                              ].join(" ")}
                            >
                              <button
                                type="button"
                                data-session-id={session.id}
                                draggable
                                onClick={() =>
                                  setActiveSession(project.id, session.id)
                                }
                                onContextMenu={(e) =>
                                  handleContextMenu(e, {
                                    kind: "session",
                                    projectId: project.id,
                                    sessionId: session.id,
                                  })
                                }
                                className={[
                                  "group/session flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors cursor-pointer",
                                  isSessionActive
                                    ? "bg-muted/70 text-foreground"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                                ].join(" ")}
                              >
                                <SessionStatusIcon
                                  sessionId={session.id}
                                  isActive={isSessionActive}
                                />

                                {renamingSessionId === session.id ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={session.title}
                                    className="min-w-0 flex-1 bg-transparent text-[12px] leading-tight text-foreground outline-none ring-1 ring-primary rounded px-1 -mx-1"
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const value = e.target.value.trim();
                                      if (value && value !== session.title) {
                                        renameSession(
                                          project.id,
                                          session.id,
                                          value,
                                        );
                                      }
                                      setRenamingSessionId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const value = (
                                          e.target as HTMLInputElement
                                        ).value.trim();
                                        if (value && value !== session.title) {
                                          renameSession(
                                            project.id,
                                            session.id,
                                            value,
                                          );
                                        }
                                        setRenamingSessionId(null);
                                      } else if (e.key === "Escape") {
                                        setRenamingSessionId(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-[12px] leading-tight">
                                    {session.title}
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) =>
                                    handleCloseSession(
                                      e,
                                      project.id,
                                      session.id,
                                    )
                                  }
                                  className={[
                                    "flex size-4 shrink-0 items-center justify-center rounded transition-colors",
                                    isSessionActive
                                      ? "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                                      : "text-transparent group-hover/session:text-muted-foreground hover:!bg-muted-foreground/10 hover:!text-foreground",
                                  ].join(" ")}
                                  aria-label={`Close ${session.title}`}
                                >
                                  <X className="size-2.5" />
                                </button>
                              </button>
                            </div>
                          );
                        }

                        return null;
                      })}

                      {/* Add chat button inside expanded section */}
                      <button
                        type="button"
                        onClick={(e) => handleNewSession(e, project.id)}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground/50 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
                      >
                        <Plus className="size-3 shrink-0" />
                        <span className="leading-tight">New Chat</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Open project button */}
      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenDirectory}
          disabled={isOpening}
          className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
        >
          {isOpening ? (
            <span className="text-[12px]">Opening…</span>
          ) : (
            <>
              <Plus className="size-3.5" />
              <span className="text-[12px]">Open Project</span>
            </>
          )}
        </Button>
        {appVersion && (
          <p className="mt-1 text-center text-[10px] text-muted-foreground/30">
            v{appVersion}
          </p>
        )}
      </div>

      {/* Context menu (rendered as portal-like fixed overlay) */}
      {renderContextMenu()}

      {/* Group create / edit dialog */}
      <GroupDialog
        open={groupDialog !== null}
        openKey={groupDialogKey}
        onClose={() => setGroupDialog(null)}
        onSubmit={handleGroupDialogSubmit}
        title={groupDialog?.mode === "edit" ? "Edit Group" : "Create Group"}
        initialName={groupDialog?.initialName ?? ""}
        initialColor={groupDialog?.initialColor ?? "#3b82f6"}
        submitLabel={groupDialog?.mode === "edit" ? "Save" : "Create"}
      />

      <HarnessRegistryDialog
        open={showRegistry}
        onClose={() => setShowRegistry(false)}
      />
    </aside>
  );
}
