export interface FileMatch {
  path: string;
  name: string;
  isDirectory: boolean;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".belay", "dist", ".next", ".cache"]);

const MAX_RESULTS = 20;

export async function searchFiles(
  projectPath: string,
  query: string,
): Promise<FileMatch[]> {
  const normalized = query.toLowerCase();
  const results: FileMatch[] = [];

  async function walk(dir: string, relPath: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;

    let entries: Array<{ name: string; isDirectory: boolean }>;
    try {
      const api = window.electronAPI;
      if (!api) return;
      entries = (await api.fsReadDir(dir, false)) as Array<{
        name: string;
        isDirectory: boolean;
      }>;
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (SKIP_DIRS.has(entry.name)) continue;

      const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;

      const matches = !query ||
        entry.name.toLowerCase().includes(normalized) ||
        entryRel.toLowerCase().includes(normalized);

      if (matches) {
        results.push({
          path: entryRel,
          name: entry.name,
          isDirectory: entry.isDirectory,
        });
      }

      if (entry.isDirectory) {
        await walk(`${dir}/${entry.name}`, entryRel);
      }
    }
  }

  await walk(projectPath, "");
  return results;
}