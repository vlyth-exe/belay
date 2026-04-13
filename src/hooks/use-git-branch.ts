import { useState, useEffect } from "react";

interface GitBranchResult {
  /** Current branch name, or null if not a git repo / not loaded */
  branch: string | null;
  /** Whether the path is inside a git repository */
  isRepo: boolean;
}

/**
 * One-shot fetch of the current git branch name for a project path.
 * Re-fetches when the path changes. No polling — call refresh() manually
 * if you need to update after a git operation.
 */
export function useGitBranch(
  projectPath: string | undefined,
): GitBranchResult {
  const [branch, setBranch] = useState<string | null>(null);
  const [isRepo, setIsRepo] = useState(false);

  useEffect(() => {
    if (!projectPath) {
      setBranch(null);
      setIsRepo(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const repo = await window.electronAPI?.gitIsRepo(projectPath);
        if (cancelled) return;

        if (!repo) {
          setBranch(null);
          setIsRepo(false);
          return;
        }

        const result = await window.electronAPI?.gitStatus(projectPath);
        if (cancelled) return;

        setIsRepo(true);
        setBranch(result?.data?.current ?? null);
      } catch {
        if (!cancelled) {
          setBranch(null);
          setIsRepo(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return { branch, isRepo };
}
