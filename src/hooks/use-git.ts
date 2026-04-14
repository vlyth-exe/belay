import { useState, useEffect, useCallback, useRef } from "react";
import type { GitStatus, GitLogEntry, GitBranch, GitError } from "@/types/git";

// ── Types ────────────────────────────────────────────────────────────

interface UseGitResult {
  /** Whether the project path is inside a git repository */
  isRepo: boolean;
  /** True while the initial load is in progress */
  loading: boolean;
  /** Current git status, or null if not a repo / not loaded yet */
  status: GitStatus | null;
  /** Recent commit log entries */
  log: GitLogEntry[];
  /** All branches (local + remote) */
  branches: GitBranch[];
  /** Last error from any git operation */
  error: GitError | null;
  /** Trigger an immediate refresh of all git data */
  refresh: () => Promise<void>;
  /** Whether a refresh is currently in flight */
  refreshing: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000;
const LOG_MAX_COUNT = 50;

// ── Hook ─────────────────────────────────────────────────────────────

export function useGitStatus(projectPath: string | undefined): UseGitResult {
  const [isRepo, setIsRepo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [error, setError] = useState<GitError | null>(null);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const projectPathRef = useRef(projectPath);

  // Keep ref in sync so the polling callback always uses the latest path
  useEffect(() => {
    projectPathRef.current = projectPath;
  }, [projectPath]);

  // ── Fetch all git data ───────────────────────────────────────────

  const refresh = useCallback(async () => {
    const path = projectPathRef.current;
    if (!path) {
      setIsRepo(false);
      setLoading(false);
      setStatus(null);
      setLog([]);
      setBranches([]);
      return;
    }

    try {
      // Check if it's a repo first
      const repo = await window.electronAPI?.gitIsRepo(path);
      if (!repo) {
        if (mountedRef.current) {
          setIsRepo(false);
          setLoading(false);
          setStatus(null);
          setLog([]);
          setBranches([]);
          setError(null);
        }
        return;
      }

      // Fire all requests in parallel
      const [statusResult, logResult, branchesResult] = await Promise.all([
        window.electronAPI?.gitStatus(path),
        window.electronAPI?.gitLog(path, LOG_MAX_COUNT),
        window.electronAPI?.gitBranches(path),
      ]);

      if (!mountedRef.current) return;

      setIsRepo(true);
      setLoading(false);

      // Status
      if (statusResult?.error) {
        setError(statusResult.error);
      } else {
        setStatus(statusResult?.data ?? null);
      }

      // Log
      if (logResult?.data) {
        setLog(logResult.data);
      }

      // Branches
      if (branchesResult?.data) {
        setBranches(branchesResult.data);
      }

      // Clear error if everything succeeded
      if (!statusResult?.error) {
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError({
          message: err instanceof Error ? err.message : String(err),
        });
        setLoading(false);
      }
    }
  }, []);

  // ── Manual refresh wrapper (sets refreshing flag) ────────────────

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refresh]);

  // ── Initial load + polling ───────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);

    // Initial fetch
    refresh().then(() => {
      if (!mountedRef.current) return;

      // Start polling
      const scheduleNext = () => {
        refreshTimeoutRef.current = setTimeout(async () => {
          if (!mountedRef.current) return;
          await refresh();
          if (mountedRef.current) {
            scheduleNext();
          }
        }, POLL_INTERVAL_MS);
      };

      scheduleNext();
    });

    return () => {
      mountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [projectPath, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isRepo,
    loading,
    status,
    log,
    branches,
    error,
    refresh: manualRefresh,
    refreshing,
  };
}
