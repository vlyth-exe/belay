import simpleGit, {
  type StatusResult,
  type LogResult,
  type BranchSummary,
  type DiffResult,
} from "simple-git";

// ── Local types (duplicated from src/types/git.ts for rootDir constraint) ──

interface GitFileEntry {
  path: string;
  indexStatus: string;
  workingStatus: string;
}

interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  modified: GitFileEntry[];
  created: GitFileEntry[];
  deleted: GitFileEntry[];
  notAdded: string[];
  conflicted: string[];
  isClean: boolean;
}

interface GitLogEntry {
  hash: string;
  hashAbbrev: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: number;
  refs: string;
}

interface GitBranch {
  name: string;
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface GitDiffStat {
  file: string;
  insertions: number;
  deletions: number;
  binary: boolean;
}

interface GitWorktree {
  path: string;
  ref: string;
  isMain: boolean;
  isLocked: boolean;
}

interface GitError {
  message: string;
  exitCode?: number;
  command?: string;
}

interface GitResult<T> {
  data: T | null;
  error: GitError | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function ok<T>(data: T): GitResult<T> {
  return { data, error: null };
}

function fail(command: string, error: unknown): GitResult<never> {
  const message = error instanceof Error ? error.message : String(error);
  const exitCode = (error as { code?: number })?.code;
  return { data: null, error: { message, exitCode, command } };
}

function toFileEntry(
  path: string,
  indexStatus: string,
  workingStatus: string,
): GitFileEntry {
  return { path, indexStatus, workingStatus };
}

// ── isRepo ───────────────────────────────────────────────────────────

export async function isRepo(dirPath: string): Promise<boolean> {
  try {
    const git = simpleGit(dirPath);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

// ── getStatus ────────────────────────────────────────────────────────

export async function getStatus(
  dirPath: string,
): Promise<GitResult<GitStatus>> {
  try {
    const git = simpleGit(dirPath);
    const status: StatusResult = await git.status();

    const staged: GitFileEntry[] = status.staged.map((p) => {
      const idx = status.files.find((f) => f.path === p);
      return toFileEntry(p, idx?.index ?? "?", idx?.working_dir ?? " ");
    });

    const modified: GitFileEntry[] = status.modified
      .filter((p) => !status.staged.includes(p))
      .map((p) => {
        const idx = status.files.find((f) => f.path === p);
        return toFileEntry(p, idx?.index ?? " ", idx?.working_dir ?? "M");
      });

    const created: GitFileEntry[] = status.created
      .filter((p) => !status.staged.includes(p))
      .map((p) => {
        const idx = status.files.find((f) => f.path === p);
        return toFileEntry(p, idx?.index ?? " ", idx?.working_dir ?? "A");
      });

    const deleted: GitFileEntry[] = status.deleted
      .filter((p) => !status.staged.includes(p))
      .map((p) => {
        const idx = status.files.find((f) => f.path === p);
        return toFileEntry(p, idx?.index ?? " ", idx?.working_dir ?? "D");
      });

    return ok({
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged,
      modified,
      created,
      deleted,
      notAdded: status.not_added,
      conflicted: status.conflicted,
      isClean: status.isClean(),
    });
  } catch (error) {
    return fail("status", error);
  }
}

// ── getLog ───────────────────────────────────────────────────────────

export async function getLog(
  dirPath: string,
  maxCount = 50,
): Promise<GitResult<GitLogEntry[]>> {
  try {
    const git = simpleGit(dirPath);
    const log: LogResult = await git.log([
      "--no-color",
      `--max-count=${maxCount}`,
    ]);

    const entries: GitLogEntry[] = log.all.map((entry) => ({
      hash: entry.hash,
      hashAbbrev: entry.hash.slice(0, 7),
      message: entry.message,
      authorName: entry.author_name,
      authorEmail: entry.author_email,
      date: new Date(entry.date).getTime(),
      refs: entry.refs ?? "",
    }));

    return ok(entries);
  } catch (error) {
    return fail("log", error);
  }
}

// ── getBranches ──────────────────────────────────────────────────────

export async function getBranches(
  dirPath: string,
): Promise<GitResult<GitBranch[]>> {
  try {
    const git = simpleGit(dirPath);
    const summary: BranchSummary = await git.branch(["--no-color", "-a"]);

    const branches: GitBranch[] = summary.all.map((name) => {
      const isRemote = name.startsWith("remotes/");
      const branch = summary.branches[name];
      return {
        name: isRemote ? name.replace(/^remotes\//, "") : name,
        fullName: name,
        isCurrent: branch?.current ?? false,
        isRemote,
      };
    });

    // Sort: current first, then local alphabetically, then remote alphabetically
    branches.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return ok(branches);
  } catch (error) {
    return fail("branch", error);
  }
}

// ── getDiffSummary ───────────────────────────────────────────────────

export async function getDiffSummary(
  dirPath: string,
  staged = true,
): Promise<GitResult<GitDiffStat[]>> {
  try {
    const git = simpleGit(dirPath);
    const diff: DiffResult = staged
      ? await git.diffSummary(["--cached"])
      : await git.diffSummary();

    const stats: GitDiffStat[] = diff.files.map((f) => ({
      file: f.file,
      insertions: "insertions" in f ? f.insertions ?? 0 : 0,
      deletions: "deletions" in f ? f.deletions ?? 0 : 0,
      binary: f.binary ?? false,
    }));

    return ok(stats);
  } catch (error) {
    return fail(staged ? "diff --cached" : "diff", error);
  }
}

// ── stage ────────────────────────────────────────────────────────────

export async function stage(
  dirPath: string,
  ...files: string[]
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    if (files.length === 0) {
      await git.add("--all");
    } else {
      await git.add(files);
    }
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "add",
    };
  }
}

// ── unstage ──────────────────────────────────────────────────────────

export async function unstage(
  dirPath: string,
  ...files: string[]
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    if (files.length === 0) {
      await git.reset(["HEAD"]);
    } else {
      await git.reset(["HEAD", "--", ...files]);
    }
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "reset",
    };
  }
}

// ── commit ───────────────────────────────────────────────────────────

export async function commit(
  dirPath: string,
  message: string,
): Promise<GitResult<string>> {
  try {
    const git = simpleGit(dirPath);
    const result = await git.commit(message);
    return ok(result.commit);
  } catch (error) {
    return fail("commit", error);
  }
}

// ── push ─────────────────────────────────────────────────────────────

export async function push(dirPath: string): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    await git.push();
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "push",
    };
  }
}

// ── pull ─────────────────────────────────────────────────────────────

export async function pull(dirPath: string): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    await git.pull();
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "pull",
    };
  }
}

// ── fetch ────────────────────────────────────────────────────────────

export async function fetch(dirPath: string): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    await git.fetch();
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "fetch",
    };
  }
}

// ── checkout ─────────────────────────────────────────────────────────

export async function checkout(
  dirPath: string,
  branch: string,
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    await git.checkout(branch);
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "checkout",
    };
  }
}

// ── createBranch ─────────────────────────────────────────────────────

export async function createBranch(
  dirPath: string,
  name: string,
  checkout = true,
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    if (checkout) {
      await git.checkoutBranch(name, "HEAD");
    } else {
      await git.branch([name]);
    }
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "branch",
    };
  }
}

// ── listWorktrees ────────────────────────────────────────────────────

export async function listWorktrees(
  dirPath: string,
): Promise<GitResult<GitWorktree[]>> {
  try {
    const git = simpleGit(dirPath);
    const raw = await git.raw(["worktree", "list", "--porcelain"]);
    const worktrees: GitWorktree[] = [];

    let current: Partial<GitWorktree> | null = null;
    for (const line of raw.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current && current.path) {
          worktrees.push({
            path: current.path,
            ref: current.ref ?? "",
            isMain: current.isMain ?? false,
            isLocked: current.isLocked ?? false,
          });
        }
        current = { path: line.slice("worktree ".length) };
      } else if (line.startsWith("branch ")) {
        if (current) {
          // branch refs/heads/feature/foo → feature/foo
          const ref = line.slice("branch ".length);
          current.ref = ref.replace(/^refs\/heads\//, "");
        }
      } else if (line.startsWith("HEAD ")) {
        // detached HEAD — store the hash if no branch ref
        if (current && !current.ref) {
          current.ref = line.slice("HEAD ".length).slice(0, 7);
        }
      } else if (line.startsWith("locked")) {
        if (current) current.isLocked = true;
      }
    }
    // Push the last entry
    if (current && current.path) {
      worktrees.push({
        path: current.path,
        ref: current.ref ?? "",
        isMain: current.isMain ?? false,
        isLocked: current.isLocked ?? false,
      });
    }

    // Mark the first worktree as main (git always lists it first)
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return ok(worktrees);
  } catch (error) {
    return fail("worktree list", error);
  }
}

// ── createWorktree ───────────────────────────────────────────────────

export async function createWorktree(
  dirPath: string,
  branch: string,
  targetPath: string,
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    await git.raw(["worktree", "add", targetPath, branch]);
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "worktree add",
    };
  }
}

// ── removeWorktree ───────────────────────────────────────────────────

export async function removeWorktree(
  dirPath: string,
  worktreePath: string,
  force = false,
): Promise<GitError | null> {
  try {
    const git = simpleGit(dirPath);
    const args = ["worktree", "remove", worktreePath];
    if (force) args.push("--force");
    await git.raw(args);
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      command: "worktree remove",
    };
  }
}
