import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Project } from "@/types/project";

// ── State shape ────────────────────────────────────────────────────────

interface ProjectState {
  openProjects: Project[];
  activeProjectId: string | null;
}

// ── Actions ────────────────────────────────────────────────────────────

type ProjectAction =
  | { type: "OPEN_PROJECT"; project: Project }
  | { type: "CLOSE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_PROJECT"; projectId: string };

// ── Context value ──────────────────────────────────────────────────────

interface ProjectStoreContextValue extends ProjectState {
  /** Open (or activate) a project given its directory path. */
  openProject: (path: string) => void;
  /** Close a project by id. If it was active, the next most-recent project becomes active. */
  closeProject: (projectId: string) => void;
  /** Switch the active project. */
  setActiveProject: (projectId: string) => void;
  /** Derive a stable id from a file-system path. */
  pathToId: (path: string) => string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY = "belay-project-state";

/** Normalise a path into a stable, unique id. */
function pathToId(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/\/$/, "");
}

/** Extract the folder name from a full path. */
function pathToName(rawPath: string): string {
  const normalised = rawPath.replace(/\\/g, "/").replace(/\/$/, "");
  const idx = normalised.lastIndexOf("/");
  return idx >= 0 ? normalised.slice(idx + 1) : normalised;
}

// ── Persistence ────────────────────────────────────────────────────────

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        openProjects: (parsed.openProjects ?? []).map(
          (p: Project & { lastOpened: string }) => ({
            ...p,
            lastOpened: new Date(p.lastOpened),
          }),
        ),
        activeProjectId: parsed.activeProjectId ?? null,
      };
    }
  } catch {
    // Ignore corrupt data
  }
  return { openProjects: [], activeProjectId: null };
}

function saveState(state: ProjectState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors etc.
  }
}

// ── Reducer ────────────────────────────────────────────────────────────

function projectReducer(
  state: ProjectState,
  action: ProjectAction,
): ProjectState {
  switch (action.type) {
    case "OPEN_PROJECT": {
      const existing = state.openProjects.find(
        (p) => p.path === action.project.path,
      );

      if (existing) {
        // Already open — just bring it to front & activate.
        const reordered = [
          ...state.openProjects.filter((p) => p.id !== existing.id),
          { ...existing, lastOpened: new Date() },
        ];
        return {
          openProjects: reordered,
          activeProjectId: existing.id,
        };
      }

      // New project
      return {
        openProjects: [
          ...state.openProjects,
          { ...action.project, lastOpened: new Date() },
        ],
        activeProjectId: action.project.id,
      };
    }

    case "CLOSE_PROJECT": {
      const remaining = state.openProjects.filter(
        (p) => p.id !== action.projectId,
      );

      // If we closed the active project, activate the last one remaining
      const newActiveId =
        state.activeProjectId === action.projectId
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : state.activeProjectId;

      return {
        openProjects: remaining,
        activeProjectId: newActiveId,
      };
    }

    case "SET_ACTIVE_PROJECT": {
      if (state.activeProjectId === action.projectId) return state;

      return {
        ...state,
        activeProjectId: action.projectId,
        openProjects: state.openProjects.map((p) =>
          p.id === action.projectId
            ? { ...p, lastOpened: new Date() }
            : p,
        ),
      };
    }

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────

const ProjectStoreContext = createContext<ProjectStoreContextValue | null>(
  null,
);

// ── Provider ───────────────────────────────────────────────────────────

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, null, loadState);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const openProject = useCallback((rawPath: string) => {
    const id = pathToId(rawPath);
    const name = pathToName(rawPath);
    dispatch({
      type: "OPEN_PROJECT",
      project: { id, name, path: rawPath, lastOpened: new Date() },
    });
  }, []);

  const closeProject = useCallback((projectId: string) => {
    dispatch({ type: "CLOSE_PROJECT", projectId });
  }, []);

  const setActiveProject = useCallback((projectId: string) => {
    dispatch({ type: "SET_ACTIVE_PROJECT", projectId });
  }, []);

  return (
    <ProjectStoreContext.Provider
      value={{
        ...state,
        openProject,
        closeProject,
        setActiveProject,
        pathToId,
      }}
    >
      {children}
    </ProjectStoreContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useProjectStore(): ProjectStoreContextValue {
  const ctx = useContext(ProjectStoreContext);
  if (!ctx) {
    throw new Error(
      "useProjectStore must be used within a <ProjectStoreProvider>",
    );
  }
  return ctx;
}
