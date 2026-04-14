import { useState, useEffect, useCallback, useRef } from "react";
import type { GitBranch, GitWorktree } from "@/types/git";

// ── Types ────────────────────────────────────────────────────────────

interface GitBranchResult {
  /** Current branch name, or null if not a git repo */
  branch: string | null;
  /** Whether the path is inside a git repository */
  isRepo: boolean;
  /** All local branches */
  branches: GitBranch[];
  /** All worktrees */
  worktrees: GitWorktree[];
  /** True while the initial fetch is in progress */
  loading: boolean;
  /** Trigger a manual re-fetch */
  refresh: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useGitBranch(
  projectPath: string | undefined,
): GitBranchResult {
  const [branch, setBranch] = useState<string | null>(null);
  const [isRepo, setIsRepo] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  const projectPathRef = useRef(projectPath);

  // Keep ref in sync
  useEffect(() => {
    projectPathRef.current = projectPath;
  }, [projectPath]);

  const fetch = useCallback(async () => {
    const path = projectPathRef.current;
    if (!path) {
      setBranch(null);
      setIsRepo(false);
      setBranches([]);
      setWorktrees([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const repo = await window.electronAPI?.gitIsRepo(path);
      if (!mountedRef.current) return;

      if (!repo) {
        setBranch(null);
        setIsRepo(false);
        setBranches([]);
        setWorktrees([]);
        setLoading(false);
        return;
      }

      const [statusResult, branchesResult, worktreesResult] =
        await Promise.all([
          window.electronAPI?.gitStatus(path),
          window.electronAPI?.gitBranches(path),
          window.electronAPI?.gitListWorktrees(path),
        ]);

      if (!mountedRef.current) return;

      setIsRepo(true);
      setBranch(statusResult?.data?.current ?? null);
      setBranches(branchesResult?.data ?? []);
      setWorktrees(worktreesResult?.data ?? []);
    } catch {
      if (!mountedRef.current) return;
      setBranch(null);
      setIsRepo(false);
      setBranches([]);
      setWorktrees([]);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch on mount and when project path changes
  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => {
      mountedRef.current = false;
    };
  }, [projectPath, fetch]);

  return { branch, isRepo, branches, worktrees, loading, refresh: fetch };
}
