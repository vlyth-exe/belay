import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  Image,
  Film,
  Music,
  Archive,
  Database,
  FileSpreadsheet,
  GitBranch,
  Package,
  RefreshCw,
} from "lucide-react";
import type { DirEntry } from "@/types/electron";

// ── File icon mapping ────────────────────────────────────────────────

const ICON_COLOR_DIRECTORY = "text-blue-400";
const ICON_COLOR_FILE = "text-muted-foreground";

function getFileIcon(name: string): [React.ElementType, string] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  // Specific filenames
  if (name === "package.json") return [Package, "text-green-400"];
  if (name === "tsconfig.json" || name.startsWith("tsconfig."))
    return [FileJson, "text-blue-400"];
  if (name === ".gitignore" || name === ".gitattributes")
    return [GitBranch, "text-orange-400"];

  // Extensions
  switch (ext) {
    // TypeScript / JavaScript
    case "ts":
    case "tsx":
      return [FileCode, "text-blue-400"];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [FileCode, "text-yellow-400"];
    case "json":
      return [FileJson, "text-yellow-500"];
    // Web
    case "html":
    case "htm":
      return [FileCode, "text-orange-400"];
    case "css":
    case "scss":
    case "less":
    case "sass":
      return [FileCode, "text-purple-400"];
    // Data / Config
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "env":
      return [FileText, "text-yellow-300"];
    case "xml":
    case "svg":
      return [FileCode, "text-orange-300"];
    // Documents
    case "md":
    case "mdx":
    case "txt":
    case "rst":
      return [FileText, ICON_COLOR_FILE];
    case "csv":
    case "xls":
    case "xlsx":
      return [FileSpreadsheet, "text-green-400"];
    case "pdf":
      return [FileText, "text-red-400"];
    // Images
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "bmp":
    case "ico":
    case "webp":
      return [Image, "text-pink-400"];
    // Audio
    case "mp3":
    case "wav":
    case "ogg":
    case "flac":
    case "aac":
      return [Music, "text-purple-300"];
    // Video
    case "mp4":
    case "webm":
    case "avi":
    case "mov":
    case "mkv":
      return [Film, "text-red-300"];
    // Archives
    case "zip":
    case "tar":
    case "gz":
    case "rar":
    case "7z":
    case "bz2":
      return [Archive, "text-yellow-400"];
    // Database
    case "sqlite":
    case "db":
    case "sql":
      return [Database, "text-blue-300"];
    // Shell
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return [FileText, "text-green-300"];
    // Lockfiles
    case "lock":
      return [FileText, "text-muted-foreground/60"];
    default:
      return [File, ICON_COLOR_FILE];
  }
}

// ── Tree node cache ──────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

function entriesToNodes(dirPath: string, entries: DirEntry[]): TreeNode[] {
  return entries.map((e) => ({
    name: e.name,
    path: dirPath + "/" + e.name,
    isDirectory: e.isDirectory,
    children: e.isDirectory ? [] : undefined,
    loaded: e.isDirectory ? false : undefined,
  }));
}

// ── TreeNodeComponent ────────────────────────────────────────────────

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onLoadChildren: (node: TreeNode) => Promise<void>;
}

function TreeNodeItem({
  node,
  depth,
  expandedPaths,
  onToggle,
  onLoadChildren,
}: TreeNodeProps) {
  const [loading, setLoading] = useState(false);
  const isExpanded = expandedPaths.has(node.path);
  const [Icon, iconColor] = node.isDirectory
    ? isExpanded
      ? [FolderOpen, ICON_COLOR_DIRECTORY]
      : [Folder, ICON_COLOR_DIRECTORY]
    : getFileIcon(node.name);

  const handleClick = useCallback(async () => {
    if (!node.isDirectory) return;
    onToggle(node.path);
    if (!node.loaded) {
      setLoading(true);
      try {
        await onLoadChildren(node);
      } finally {
        setLoading(false);
      }
    }
  }, [node, onToggle, onLoadChildren]);

  // Indent based on depth; each level = 16px
  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={[
          "flex w-full items-center gap-1 rounded-sm py-[3px] pr-2 text-left text-[12px] transition-colors",
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          loading ? "opacity-60" : "",
        ].join(" ")}
        style={{ paddingLeft }}
      >
        {/* Expand/collapse chevron or spacer */}
        {node.isDirectory ? (
          isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 opacity-60" />
          )
        ) : (
          <span className="inline-block size-3.5 shrink-0" />
        )}

        {/* Icon */}
        <Icon className={`size-3.5 shrink-0 ${iconColor}`} />

        {/* Name */}
        <span className="truncate">{node.name}</span>
      </button>

      {/* Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.length === 0 && node.loaded && (
            <div
              className="py-1 text-[11px] italic text-muted-foreground/50"
              style={{ paddingLeft: paddingLeft + 16 + 14 + 4 }}
            >
              Empty directory
            </div>
          )}
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onLoadChildren={onLoadChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── FileExplorer props ───────────────────────────────────────────────

export interface FileExplorerProps {
  /** The root directory path to explore. */
  rootPath: string;
  /** Optional short label for the root (defaults to basename). */
  rootLabel?: string;
}

// ── FileExplorer component ───────────────────────────────────────────

export function FileExplorer({ rootPath, rootLabel }: FileExplorerProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rootLoadedRef = useRef(false);

  // Normalise root path — use forward slashes for consistent keying
  const normalisedRoot = rootPath.replace(/\\/g, "/");
  const displayRoot = rootLabel ?? normalisedRoot.split("/").pop() ?? rootPath;

  /** Load the root directory contents. */
  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await window.electronAPI?.fsReadDir(normalisedRoot);
      if (entries) {
        setTree(entriesToNodes(normalisedRoot, entries));
        rootLoadedRef.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read directory");
    } finally {
      setLoading(false);
    }
  }, [normalisedRoot]);

  /** Lazy-load children for a directory node. */
  const loadChildren = useCallback(async (node: TreeNode): Promise<void> => {
    const entries = await window.electronAPI?.fsReadDir(node.path);
    if (!entries) return;

    const children = entriesToNodes(node.path, entries);

    setTree((prev) => {
      const update = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.path === node.path) {
            return { ...n, children, loaded: true };
          }
          if (n.children) {
            return { ...n, children: update(n.children) };
          }
          return n;
        });
      return update(prev);
    });
  }, []);

  /** Toggle a directory's expanded state. */
  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  /** Refresh the entire tree. */
  const handleRefresh = useCallback(() => {
    setExpandedPaths(new Set());
    setTree([]);
    rootLoadedRef.current = false;
    loadRoot();
  }, [loadRoot]);

  // Reset and reload when root path changes
  useEffect(() => {
    setTree([]);
    setExpandedPaths(new Set());
    setError(null);
    rootLoadedRef.current = false;
    loadRoot();
  }, [normalisedRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Folder className="size-3.5 text-blue-400" />
        <span className="truncate text-[12px] font-medium text-foreground">
          {displayRoot}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Refresh directory tree"
          title="Refresh"
        >
          <RefreshCw className="size-3" />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loading && tree.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-[11px] text-muted-foreground/60">
            <RefreshCw className="size-3 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center text-[11px] text-destructive">
            {error}
          </div>
        ) : tree.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
            Empty directory
          </div>
        ) : (
          tree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={expandedPaths}
              onToggle={togglePath}
              onLoadChildren={loadChildren}
            />
          ))
        )}
      </div>

      {/* Footer with path hint */}
      <div className="border-t border-border/40 px-3 py-1.5">
        <span
          className="block truncate text-[10px] text-muted-foreground/50"
          title={normalisedRoot}
        >
          {normalisedRoot}
        </span>
      </div>
    </div>
  );
}
