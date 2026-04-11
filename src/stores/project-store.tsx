import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Project, ChatSession } from "@/types/project";

// ── State shape ────────────────────────────────────────────────────────

interface ProjectState {
  openProjects: Project[];
  activeProjectId: string | null;
}

// ── Actions ────────────────────────────────────────────────────────────

type ProjectAction =
  | { type: "OPEN_PROJECT"; project: Project }
  | { type: "CLOSE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_PROJECT"; projectId: string }
  | { type: "ADD_SESSION"; projectId: string; session: ChatSession }
  | { type: "REMOVE_SESSION"; projectId: string; sessionId: string }
  | { type: "SET_ACTIVE_SESSION"; projectId: string; sessionId: string }
  | {
      type: "RENAME_SESSION";
      projectId: string;
      sessionId: string;
      title: string;
    }
  | {
      type: "SET_SESSION_AGENT";
      projectId: string;
      sessionId: string;
      agentId: string | null;
    };

// ── Context value ──────────────────────────────────────────────────────

interface ProjectStoreContextValue extends ProjectState {
  openProject: (path: string) => void;
  closeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  pathToId: (path: string) => string;
  addSession: (projectId: string) => string;
  removeSession: (projectId: string, sessionId: string) => void;
  setActiveSession: (projectId: string, sessionId: string) => void;
  renameSession: (projectId: string, sessionId: string, title: string) => void;
  setSessionAgent: (
    projectId: string,
    sessionId: string,
    agentId: string | null,
  ) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY = "belay-project-state";

function pathToId(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/\/$/, "");
}

function pathToName(rawPath: string): string {
  const normalised = rawPath.replace(/\\/g, "/").replace(/\/$/, "");
  const idx = normalised.lastIndexOf("/");
  return idx >= 0 ? normalised.slice(idx + 1) : normalised;
}

function makeDefaultSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    createdAt: new Date(),
    agentId: null,
  };
}

// ── Persistence ────────────────────────────────────────────────────────

interface SerializedProject extends Omit<Project, "lastOpened" | "sessions"> {
  lastOpened: string;
  sessions: Array<Omit<ChatSession, "createdAt"> & { createdAt: string }>;
}

function ensureSessions(project: SerializedProject): Project {
  const sessions = (project.sessions ?? []).map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt),
    agentId: s.agentId ?? null,
  }));
  // Backward compat: projects loaded from storage before sessions existed
  if (sessions.length === 0) {
    const defaultSession = makeDefaultSession();
    sessions.push(defaultSession);
  }
  return {
    ...project,
    lastOpened: new Date(project.lastOpened),
    sessions,
    activeSessionId: project.activeSessionId ?? sessions[0].id ?? null,
  };
}

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        openProjects: (parsed.openProjects ?? []).map(ensureSessions),
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
    // Ignore quota errors
  }
}

// ── Reducer helpers ────────────────────────────────────────────────────

function updateProject(
  projects: Project[],
  projectId: string,
  updater: (project: Project) => Project,
): Project[] {
  return projects.map((p) => (p.id === projectId ? updater(p) : p));
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
        const reordered = [
          ...state.openProjects.filter((p) => p.id !== existing.id),
          { ...existing, lastOpened: new Date() },
        ];
        return {
          openProjects: reordered,
          activeProjectId: existing.id,
        };
      }

      const defaultSession = makeDefaultSession();
      const newProject: Project = {
        ...action.project,
        lastOpened: new Date(),
        sessions: [defaultSession],
        activeSessionId: defaultSession.id,
      };

      return {
        openProjects: [...state.openProjects, newProject],
        activeProjectId: newProject.id,
      };
    }

    case "CLOSE_PROJECT": {
      const remaining = state.openProjects.filter(
        (p) => p.id !== action.projectId,
      );
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
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            lastOpened: new Date(),
          }),
        ),
      };
    }

    case "ADD_SESSION": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            sessions: [...p.sessions, action.session],
            activeSessionId: action.session.id,
          }),
        ),
      };
    }

    case "REMOVE_SESSION": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const remaining = p.sessions.filter(
              (s) => s.id !== action.sessionId,
            );
            // If the removed session was active, activate the last remaining
            const newActiveSessionId =
              p.activeSessionId === action.sessionId
                ? remaining.length > 0
                  ? remaining[remaining.length - 1].id
                  : null
                : p.activeSessionId;
            return {
              ...p,
              sessions: remaining,
              activeSessionId: newActiveSessionId,
            };
          },
        ),
      };
    }

    case "SET_ACTIVE_SESSION": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) =>
            p.activeSessionId === action.sessionId
              ? p
              : { ...p, activeSessionId: action.sessionId },
        ),
      };
    }

    case "RENAME_SESSION": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === action.sessionId ? { ...s, title: action.title } : s,
            ),
          }),
        ),
      };
    }

    case "SET_SESSION_AGENT": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === action.sessionId ? { ...s, agentId: action.agentId } : s,
            ),
          }),
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

  useEffect(() => {
    saveState(state);
  }, [state]);

  const openProject = useCallback((rawPath: string) => {
    const id = pathToId(rawPath);
    const name = pathToName(rawPath);
    dispatch({
      type: "OPEN_PROJECT",
      project: {
        id,
        name,
        path: rawPath,
        lastOpened: new Date(),
        sessions: [],
        activeSessionId: null,
      },
    });
  }, []);

  const closeProject = useCallback(
    (projectId: string) => {
      // Side effect: delete message files for all sessions in the project
      const project = state.openProjects.find((p) => p.id === projectId);
      if (project) {
        for (const session of project.sessions) {
          window.electronAPI?.sessionDeleteMessages(session.id).catch((err) => {
            console.error(
              `[ProjectStore] Failed to delete session messages for ${session.id}:`,
              err,
            );
          });
        }
      }
      dispatch({ type: "CLOSE_PROJECT", projectId });
    },
    [state.openProjects],
  );

  const setActiveProject = useCallback((projectId: string) => {
    dispatch({ type: "SET_ACTIVE_PROJECT", projectId });
  }, []);

  const addSession = useCallback((projectId: string): string => {
    const session = makeDefaultSession();
    dispatch({ type: "ADD_SESSION", projectId, session });
    return session.id;
  }, []);

  const removeSession = useCallback((projectId: string, sessionId: string) => {
    dispatch({ type: "REMOVE_SESSION", projectId, sessionId });
    // Side effect: delete the persisted message file for this session
    window.electronAPI?.sessionDeleteMessages(sessionId).catch((err) => {
      console.error(
        `[ProjectStore] Failed to delete session messages for ${sessionId}:`,
        err,
      );
    });
  }, []);

  const setActiveSession = useCallback(
    (projectId: string, sessionId: string) => {
      dispatch({ type: "SET_ACTIVE_SESSION", projectId, sessionId });
    },
    [],
  );

  const renameSession = useCallback(
    (projectId: string, sessionId: string, title: string) => {
      dispatch({ type: "RENAME_SESSION", projectId, sessionId, title });
    },
    [],
  );

  const setSessionAgent = useCallback(
    (projectId: string, sessionId: string, agentId: string | null) => {
      dispatch({ type: "SET_SESSION_AGENT", projectId, sessionId, agentId });
    },
    [],
  );

  return (
    <ProjectStoreContext.Provider
      value={{
        ...state,
        openProject,
        closeProject,
        setActiveProject,
        pathToId,
        addSession,
        removeSession,
        setActiveSession,
        renameSession,
        setSessionAgent,
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
