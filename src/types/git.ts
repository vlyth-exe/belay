// ── Git status types ─────────────────────────────────────────────────

export interface GitFileEntry {
  path: string;
  /** Index status code from git status --porcelain */
  indexStatus: string;
  /** Working tree status code from git status --porcelain */
  workingStatus: string;
}

export interface GitStatus {
  /** Current branch name, or "HEAD" if detached */
  current: string | null;
  /** Tracking branch name (e.g. "origin/main") */
  tracking: string | null;
  /** Number of commits ahead of tracking branch */
  ahead: number;
  /** Number of commits behind tracking branch */
  behind: number;
  /** Files staged in the index */
  staged: GitFileEntry[];
  /** Files modified in the working tree (not staged) */
  modified: GitFileEntry[];
  /** Files created but not yet tracked */
  created: GitFileEntry[];
  /** Files deleted from the working tree (not staged) */
  deleted: GitFileEntry[];
  /** Files not tracked by git */
  notAdded: string[];
  /** Files with merge conflicts */
  conflicted: string[];
  /** True if working tree is clean */
  isClean: boolean;
}

// ── Git log types ────────────────────────────────────────────────────

export interface GitLogEntry {
  /** Full commit hash */
  hash: string;
  /** Abbreviated commit hash (7 chars) */
  hashAbbrev: string;
  /** First line of the commit message */
  message: string;
  /** Author name */
  authorName: string;
  /** Author email */
  authorEmail: string;
  /** Commit date as milliseconds since epoch */
  date: number;
  /** Number of refs pointing at this commit (tags, branches) */
  refs: string;
}

// ── Git branch types ─────────────────────────────────────────────────

export interface GitBranch {
  /** Branch name (without remote prefix for local, with for remote) */
  name: string;
  /** Full branch name as reported by git (e.g. "remotes/origin/main") */
  fullName: string;
  /** Whether this is the currently checked out branch */
  isCurrent: boolean;
  /** Whether this is a remote-tracking branch */
  isRemote: boolean;
}

// ── Git diff summary ─────────────────────────────────────────────────

export interface GitDiffStat {
  /** File path */
  file: string;
  /** Number of lines inserted */
  insertions: number;
  /** Number of lines deleted */
  deletions: number;
  /** True if the file is a binary file */
  binary: boolean;
}

// ── Git worktree type ────────────────────────────────────────────────

export interface GitWorktree {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch or commit the worktree is on */
  ref: string;
  /** True if this is the main/primary worktree */
  isMain: boolean;
  /** True if the worktree is locked */
  isLocked: boolean;
}

// ── Git error type ───────────────────────────────────────────────────

export interface GitError {
  message: string;
  /** Exit code from the git process, if available */
  exitCode?: number;
  /** The git command that failed */
  command?: string;
}
