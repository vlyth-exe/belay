import { useState, useEffect, useCallback } from "react";
import { Minus, Square, X, Globe, Settings, GitBranch, Plus, Check, FolderTree } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import belayIcon from "/Belay.svg";

import { HarnessRegistryDialog } from "@/components/harness/harness-registry-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGitBranch } from "@/hooks/use-git-branch";
import { useProjectStore } from "@/stores/project-store";

/** The standard Windows "restore" icon — two overlapping offset rectangles. */
function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3.5" y="5.5" width="7" height="7" rx="0.5" />
      <path d="M5.5 5.5V3.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

export interface TitleBarProps {
  /** Project path used to look up the current git branch. */
  projectPath?: string;
}

export function TitleBar({ projectPath }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    const unsubMaximize = api.onMaximize(() => setIsMaximized(true));
    const unsubUnmaximize = api.onUnmaximize(() => setIsMaximized(false));
    return () => {
      unsubMaximize?.();
      unsubUnmaximize?.();
    };
  }, []);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.close();
  }, []);

  return (
    <header
      className="flex h-9 shrink-0 select-none items-center border-b border-border bg-background/80 backdrop-blur-sm"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={handleMaximize}
    >
      {/* Left — app title */}
      <div className="flex items-center gap-2 pl-3.5">
        <img src={belayIcon} alt="" className="size-5" />
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          Belay
        </span>
      </div>

      {/* Agent registry */}
      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => setShowRegistry(true)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Browse agent registry"
          title="Browse agent registry"
        >
          <Globe className="size-3.5" />
        </button>
      </div>

      {/* Centre — git branch dropdown */}
      <div className="flex min-w-0 flex-1 items-center justify-center px-4">
        <BranchDropdown projectPath={projectPath} />
      </div>

      {/* Settings & theme toggle */}
      <div
        className="flex h-full items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-3.5" />
        </button>
        <ThemeToggle />
      </div>

      {/* Right — window controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/60"
          aria-label="Minimize"
          type="button"
        >
          <Minus className="size-[15px]" strokeWidth={1.8} />
        </button>

        <button
          onClick={handleMaximize}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/60"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          type="button"
        >
          {isMaximized ? (
            <RestoreIcon className="size-[15px]" />
          ) : (
            <Square className="size-[14px]" strokeWidth={1.6} />
          )}
        </button>

        <button
          onClick={handleClose}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white active:bg-destructive/90"
          aria-label="Close"
          type="button"
        >
          <X className="size-[15px]" strokeWidth={1.8} />
        </button>
      </div>

      {/* Dialogs */}
      <HarnessRegistryDialog
        open={showRegistry}
        onClose={() => setShowRegistry(false)}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenRegistry={() => {
          setShowSettings(false);
          setShowRegistry(true);
        }}
      />
    </header>
  );
}

// ── Branch/worktree dropdown ─────────────────────────────────────────

function BranchDropdown({ projectPath }: { projectPath?: string }) {
  const { branch, isRepo, branches, worktrees, refresh } =
    useGitBranch(projectPath);
  const { addSession, activeProjectId } = useProjectStore();
  const [dropdownTab, setDropdownTab] = useState<"branches" | "worktrees">(
    "branches",
  );
  const [newBranchName, setNewBranchName] = useState("");
  const [creating, setCreating] = useState(false);

  if (!isRepo || !branch) return null;

  const localBranches = branches.filter((b) => !b.isRemote);

  const handleCheckout = async (name: string) => {
    await window.electronAPI?.gitCheckout(projectPath!, name);
    refresh();
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    setCreating(true);
    await window.electronAPI?.gitCreateBranch(
      projectPath!,
      newBranchName.trim(),
      true,
    );
    setNewBranchName("");
    setCreating(false);
    refresh();
  };

  const handleCreateWorktreeFromInput = async () => {
    if (!newBranchName.trim()) return;
    setCreating(true);
    const name = newBranchName.trim();
    await window.electronAPI?.gitCreateBranch(projectPath!, name, false);
    const parts = projectPath!.replace(/\\/g, "/").split("/");
    const parent = parts.slice(0, -1).join("/");
    const slug = name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const target = parent + "/" + slug;
    const err = await window.electronAPI?.gitCreateWorktree(
      projectPath!,
      name,
      target,
    );
    if (!err && activeProjectId) {
      addSession(activeProjectId, { title: name, path: target });
    }
    setNewBranchName("");
    setCreating(false);
    refresh();
  };

  const handleCreateWorktree = async (branchName: string) => {
    const parts = projectPath!.replace(/\\/g, "/").split("/");
    const parent = parts.slice(0, -1).join("/");
    const slug = branchName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const target = parent + "/" + slug;
    const err = await window.electronAPI?.gitCreateWorktree(
      projectPath!,
      branchName,
      target,
    );
    if (!err && activeProjectId) {
      addSession(activeProjectId, { title: branchName, path: target });
    }
    refresh();
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <GitBranch className="size-3" />
        <span className="max-w-[120px] truncate">{branch}</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="center" className="z-50">
          <Menu.Popup className="w-60 rounded-lg border border-border bg-popover p-1 shadow-lg outline-none">
            {/* ── Tabs ── */}
            <div className="flex border-b border-border/30 px-1">
              <button
                type="button"
                onClick={() => setDropdownTab("branches")}
                className={[
                  "flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-[11px] font-medium transition-colors",
                  dropdownTab === "branches"
                    ? "border-foreground/50 text-foreground/80"
                    : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/70",
                ].join(" ")}
              >
                <GitBranch className="size-3" />
                Branches
              </button>
              <button
                type="button"
                onClick={() => setDropdownTab("worktrees")}
                className={[
                  "flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-[11px] font-medium transition-colors",
                  dropdownTab === "worktrees"
                    ? "border-foreground/50 text-foreground/80"
                    : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/70",
                ].join(" ")}
              >
                <FolderTree className="size-3" />
                Worktrees
              </button>
            </div>

            <div className="pt-1">
              {/* ── Branches tab ── */}
              {dropdownTab === "branches" && (
                <>
                  {localBranches.map((b) => (
                    <Menu.Item
                      key={b.name}
                      className={[
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12px] outline-none transition-colors",
                        b.isCurrent
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                      onClick={() => !b.isCurrent && handleCheckout(b.name)}
                    >
                      <GitBranch className="size-3 shrink-0 text-muted-foreground/40" />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      {b.isCurrent && (
                        <Check className="size-3 shrink-0 text-muted-foreground/40" />
                      )}
                      {!b.isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateWorktree(b.name);
                          }}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/20 transition-colors hover:bg-muted hover:text-foreground"
                          title={`Create worktree for ${b.name}`}
                        >
                          <FolderTree className="size-3" />
                        </button>
                      )}
                    </Menu.Item>
                  ))}

                  {/* ── Create branch input ── */}
                  <div
                    className="flex items-center gap-1 border-t border-border/30 px-1 pt-1"
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Plus className="size-3 shrink-0 text-muted-foreground/30" />
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="New branch…"
                      disabled={creating}
                      className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") handleCreateBranch();
                      }}
                    />
                    {newBranchName.trim() && (
                      <>
                        <button
                          type="button"
                          onClick={handleCreateWorktreeFromInput}
                          disabled={creating}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/30 transition-colors hover:bg-muted hover:text-foreground"
                          title="Create as worktree &amp; open"
                        >
                          <FolderTree className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateBranch}
                          disabled={creating}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/30 transition-colors hover:bg-muted hover:text-foreground"
                          title="Create &amp; checkout branch"
                        >
                          <Check className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ── Worktrees tab ── */}
              {dropdownTab === "worktrees" && (
                <>
                  {worktrees.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[11px] text-muted-foreground/30">
                      No worktrees
                    </div>
                  ) : (
                    worktrees.map((wt) => {
                      const isCurrent =
                        wt.path.replace(/\\/g, "/") ===
                        projectPath?.replace(/\\/g, "/");
                      return (
                        <Menu.Item
                          key={wt.path}
                          className={[
                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-[12px] outline-none transition-colors",
                            isCurrent
                              ? "bg-muted text-foreground"
                              : "cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground",
                          ].join(" ")}
                          onClick={() =>
                            !isCurrent &&
                            activeProjectId &&
                            addSession(activeProjectId, {
                              title: wt.ref,
                              path: wt.path,
                            })
                          }
                        >
                          <FolderTree className="size-3 shrink-0 text-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate">{wt.ref}</span>
                            <span className="block truncate text-[10px] text-muted-foreground/30">
                              {wt.path}
                            </span>
                          </div>
                          {isCurrent && (
                            <Check className="size-3 shrink-0 text-muted-foreground/40" />
                          )}
                        </Menu.Item>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
