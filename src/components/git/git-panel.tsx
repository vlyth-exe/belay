import { useState, useCallback } from "react";
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  Check,
  RefreshCw,
  Circle,
  ArrowUpDown,
  Download,
  SquarePlus,
  SquareMinus,
} from "lucide-react";
import { useGitStatus } from "@/hooks/use-git";

// ── Types ────────────────────────────────────────────────────────────

type FileStatus = "M" | "A" | "D" | "R" | "C" | "?";

const STATUS_COLORS: Record<FileStatus, string> = {
  M: "text-amber-400",
  A: "text-green-400",
  D: "text-red-400",
  R: "text-blue-400",
  C: "text-red-400",
  "?": "text-muted-foreground/40",
};

interface FileChange {
  path: string;
  status: FileStatus;
  isStaged: boolean;
}

// ── Checkbox ─────────────────────────────────────────────────────────

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
}

function Checkbox({ checked, onChange }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        "flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        checked
          ? "border-foreground/30 bg-foreground/15 text-foreground"
          : "border-muted-foreground/20 hover:border-muted-foreground/40",
      ].join(" ")}
    >
      {checked && <Check className="size-2.5" strokeWidth={3} />}
    </button>
  );
}

// ── File row ─────────────────────────────────────────────────────────

interface FileRowProps {
  change: FileChange;
  onToggle: () => void;
}

function FileRow({ change, onToggle }: FileRowProps) {
  const parts = change.path.split("/");
  const fileName = parts.pop() ?? change.path;
  const parent = parts.length > 0 ? parts.join("/") + "/" : "";

  return (
    <div className="flex items-center gap-1.5 px-2 py-[3px] text-[12px] transition-colors hover:bg-muted/30">
      <Checkbox checked={change.isStaged} onChange={onToggle} />
      <span
        className={`w-3 shrink-0 text-center text-[10px] font-bold tabular-nums ${STATUS_COLORS[change.status]}`}
      >
        {change.status}
      </span>
      <span
        className="min-w-0 truncate text-foreground/70"
        title={change.path}
      >
        {parent && (
          <span className="text-muted-foreground/30">{parent}</span>
        )}
        <span>{fileName}</span>
      </span>
    </div>
  );
}

// ── GitPanel ─────────────────────────────────────────────────────────

export interface GitPanelProps {
  projectPath: string;
}

export function GitPanel({ projectPath }: GitPanelProps) {
  const { isRepo, loading, status, error, refresh, refreshing } =
    useGitStatus(projectPath);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<"fetch" | "push" | "pull">("push");
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Build unified file list ──────────────────────────────────────

  const files: FileChange[] = [];

  if (status) {
    const stagedSet = new Set(status.staged.map((e) => e.path));

    for (const entry of status.staged) {
      const s = entry.indexStatus;
      const fileStatus: FileStatus =
        s === "M" || s === "A" || s === "D" || s === "R" ? s : "?";
      files.push({ path: entry.path, status: fileStatus, isStaged: true });
    }

    for (const entry of status.modified) {
      if (!stagedSet.has(entry.path)) {
        files.push({ path: entry.path, status: "M", isStaged: false });
      }
    }
    for (const entry of status.created) {
      if (!stagedSet.has(entry.path)) {
        files.push({ path: entry.path, status: "A", isStaged: false });
      }
    }
    for (const entry of status.deleted) {
      if (!stagedSet.has(entry.path)) {
        files.push({ path: entry.path, status: "D", isStaged: false });
      }
    }
    for (const p of status.conflicted) {
      if (!stagedSet.has(p)) {
        files.push({ path: p, status: "C", isStaged: false });
      }
    }
    for (const p of status.notAdded) {
      if (!stagedSet.has(p)) {
        files.push({ path: p, status: "?", isStaged: false });
      }
    }
  }

  const stagedCount = files.filter((f) => f.isStaged).length;
  const unstagedCount = files.filter((f) => !f.isStaged).length;
  const totalChanges = files.length;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const allStaged = totalChanges > 0 && unstagedCount === 0;

  // ── Actions ───────────────────────────────────────────────────────

  const handleToggleFile = useCallback(
    async (filePath: string, currentlyStaged: boolean) => {
      setActionError(null);
      const err = currentlyStaged
        ? await window.electronAPI?.gitUnstage(projectPath, filePath)
        : await window.electronAPI?.gitStage(projectPath, filePath);
      if (err) setActionError(err.message);
      refresh();
    },
    [projectPath, refresh],
  );

  const handleStageAll = useCallback(async () => {
    setActionError(null);
    const err = await window.electronAPI?.gitStage(projectPath);
    if (err) setActionError(err.message);
    refresh();
  }, [projectPath, refresh]);

  const handleUnstageAll = useCallback(async () => {
    setActionError(null);
    const err = await window.electronAPI?.gitUnstage(projectPath);
    if (err) setActionError(err.message);
    refresh();
  }, [projectPath, refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || stagedCount === 0) return;
    setActionError(null);
    setCommitting(true);
    try {
      const result = await window.electronAPI?.gitCommit(
        projectPath,
        commitMessage.trim(),
      );
      if (result?.error) {
        setActionError(result.error.message);
      } else {
        setCommitMessage("");
      }
      refresh();
    } finally {
      setCommitting(false);
    }
  }, [projectPath, commitMessage, stagedCount, refresh]);

  // Resolve effective mode: if user has "push" selected but nothing to push, fetch instead
  const effectiveMode: "fetch" | "push" | "pull" =
    syncMode === "push" && ahead === 0 ? "fetch" : syncMode;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      if (effectiveMode === "push") {
        await window.electronAPI?.gitPush(projectPath);
      } else if (effectiveMode === "pull") {
        await window.electronAPI?.gitPull(projectPath);
      } else {
        await window.electronAPI?.gitFetch(projectPath);
      }
      refresh();
    } finally {
      setSyncing(false);
    }
  }, [projectPath, effectiveMode, refresh]);

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <RefreshCw className="size-4 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  // ── Not a repo ────────────────────────────────────────────────────

  if (!isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <Circle className="size-4 text-muted-foreground/20" />
        <p className="text-[11px] text-muted-foreground/40">
          Not a git repository
        </p>
      </div>
    );
  }

  // ── Main content ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Branch bar ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground/50" />
        <span className="min-w-0 truncate text-[12px] font-medium text-foreground/80">
          {status?.current ?? "HEAD"}
        </span>

        {ahead > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-green-400/70">
            <ArrowUp className="size-2.5" />
            {ahead}
          </span>
        )}
        {behind > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-amber-400/70">
            <ArrowDown className="size-2.5" />
            {behind}
          </span>
        )}

        <div className="flex-1" />

        {totalChanges > 0 && (
          <button
            type="button"
            onClick={allStaged ? handleUnstageAll : handleStageAll}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
            title={allStaged ? "Unstage All" : "Stage All"}
          >
            {allStaged ? <SquareMinus className="size-3.5" /> : <SquarePlus className="size-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
          title="Refresh"
        >
          <RefreshCw
            className={`size-3 ${refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* ── Error ── */}
      {(error || actionError) && (
        <div className="shrink-0 border-b border-border/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive/80">
          {actionError ?? error!.message}
        </div>
      )}

      {/* ── File list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {files.length > 0 ? (
          files.map((file) => (
            <FileRow
              key={file.path}
              change={file}
              onToggle={() => handleToggleFile(file.path, file.isStaged)}
            />
          ))
        ) : (
          <div className="flex items-center justify-center gap-1.5 py-8 text-[11px] text-muted-foreground/30">
            <Circle className="size-2.5 fill-green-400/30 text-green-400/30" />
            <span>Clean working tree</span>
          </div>
        )}
      </div>

      {/* ── Bottom bar: commit + sync ── */}
      <div className="shrink-0 border-t border-border/40">
        {/* Commit textarea with inset button */}
        <div className="relative px-2 pt-2">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            rows={2}
            className="w-full resize-none rounded-md border border-border/50 bg-transparent pl-2.5 pr-2 pb-8 pt-2 text-[12px] text-foreground placeholder:text-muted-foreground/30 focus:border-foreground/20 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <button
            type="button"
            onClick={handleCommit}
            disabled={stagedCount === 0 || !commitMessage.trim() || committing}
            className="absolute bottom-[26px] right-4 flex items-center gap-1 rounded-md bg-foreground/[0.08] px-2 py-1 text-[11px] font-medium text-foreground/60 transition-colors hover:bg-foreground/[0.14] hover:text-foreground disabled:opacity-25"
          >
            <Check className="size-3" />
            {committing ? "…" : "Commit"}
          </button>
        </div>

        {/* Sync button row */}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/40 py-1.5 text-[11px] font-medium text-muted-foreground/50 transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-30"
          >
            {effectiveMode === "push" ? (
              <>
                <ArrowUp className="size-3" />
                Push
              </>
            ) : effectiveMode === "pull" ? (
              <>
                <ArrowDown className="size-3" />
                Pull
              </>
            ) : (
              <>
                <Download className="size-3" />
                Fetch
              </>
            )}
            {syncing && (
              <RefreshCw className="size-2.5 animate-spin" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setSyncMode(effectiveMode === "pull" ? "push" : "pull")}
            className="flex size-[30px] shrink-0 items-center justify-center rounded-md border border-border/40 text-muted-foreground/30 transition-colors hover:bg-muted/30 hover:text-foreground"
            title={`Switch to ${effectiveMode === "pull" ? (ahead > 0 ? "Push" : "Fetch") : "Pull"}`}
          >
            <ArrowUpDown className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
