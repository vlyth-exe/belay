import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Project, ChatSession, SessionGroup } from "@/types/project";

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
    }
  | {
      type: "SET_SESSION_PATH";
      projectId: string;
      sessionId: string;
      path: string | undefined;
    }
  | { type: "REORDER_PROJECTS"; projectIds: string[] }
  | { type: "REORDER_SESSIONS"; projectId: string; sessionIds: string[] }
  | {
      type: "CREATE_GROUP";
      projectId: string;
      group: SessionGroup;
      initialSessionIds?: string[];
    }
  | { type: "DELETE_GROUP"; projectId: string; groupId: string }
  | {
      type: "RENAME_GROUP";
      projectId: string;
      groupId: string;
      name: string;
    }
  | {
      type: "SET_GROUP_COLOR";
      projectId: string;
      groupId: string;
      color: string;
    }
  | {
      type: "ADD_SESSION_TO_GROUP";
      projectId: string;
      groupId: string;
      sessionId: string;
    }
  | {
      type: "REMOVE_SESSION_FROM_GROUP";
      projectId: string;
      groupId: string;
      sessionId: string;
    }
  | {
      type: "TOGGLE_GROUP_COLLAPSED";
      projectId: string;
      groupId: string;
    }
  | {
      type: "REORDER_GROUPS";
      projectId: string;
      groupIds: string[];
    }
  | {
      type: "REORDER_GROUP_SESSIONS";
      projectId: string;
      groupId: string;
      sessionIds: string[];
    }
  | { type: "REORDER_LAYOUT"; projectId: string; layout: string[] }
  | {
      type: "UNGROUP_SESSION_AT_POSITION";
      projectId: string;
      sessionId: string;
      layout: string[];
    }
  | {
      type: "HYDRATE_PROJECT";
      projectId: string;
      sessions: ChatSession[];
      activeSessionId: string | null;
      groups: SessionGroup[];
      layout: string[];
    };

// ── Context value ──────────────────────────────────────────────────────

interface ProjectStoreContextValue extends ProjectState {
  openProject: (path: string) => void;
  closeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  pathToId: (path: string) => string;
  addSession: (
    projectId: string,
    overrides?: { title?: string; path?: string },
  ) => string;
  removeSession: (projectId: string, sessionId: string) => void;
  setActiveSession: (projectId: string, sessionId: string) => void;
  renameSession: (projectId: string, sessionId: string, title: string) => void;
  setSessionAgent: (
    projectId: string,
    sessionId: string,
    agentId: string | null,
  ) => void;
  setSessionPath: (
    projectId: string,
    sessionId: string,
    path: string | undefined,
  ) => void;
  reorderProjects: (projectIds: string[]) => void;
  reorderSessions: (projectId: string, sessionIds: string[]) => void;
  createGroup: (
    projectId: string,
    name: string,
    color: string,
    initialSessionIds?: string[],
  ) => string;
  deleteGroup: (projectId: string, groupId: string) => void;
  renameGroup: (projectId: string, groupId: string, name: string) => void;
  setGroupColor: (projectId: string, groupId: string, color: string) => void;
  addSessionToGroup: (
    projectId: string,
    groupId: string,
    sessionId: string,
  ) => void;
  removeSessionFromGroup: (
    projectId: string,
    groupId: string,
    sessionId: string,
  ) => void;
  toggleGroupCollapsed: (projectId: string, groupId: string) => void;
  reorderGroups: (projectId: string, groupIds: string[]) => void;
  reorderGroupSessions: (
    projectId: string,
    groupId: string,
    sessionIds: string[],
  ) => void;
  reorderLayout: (projectId: string, layout: string[]) => void;
  ungroupSessionAtPosition: (
    projectId: string,
    sessionId: string,
    layout: string[],
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

/** Derive a layout from existing groups and sessions (migration helper). */
function computeLayout(
  groups: SessionGroup[],
  sessions: ChatSession[],
): string[] {
  const groupedIds = new Set(groups.flatMap((g) => g.sessionIds));
  const ungrouped = sessions.filter((s) => !groupedIds.has(s.id));
  return [...groups.map((g) => g.id), ...ungrouped.map((s) => s.id)];
}

function loadState(): ProjectState {
  // Load the lightweight registry from localStorage.
  // Per-project data (sessions, groups, layout) is loaded asynchronously
  // via loadProjectFromDisk() when the provider mounts.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        openProjects: (parsed.openProjects ?? []).map(
          (p: Record<string, unknown>) => ({
            id: p.id as string,
            name: p.name as string,
            path: p.path as string,
            lastOpened: new Date(p.lastOpened as string),
            sessions: [],
            activeSessionId: null,
            groups: [],
            layout: [],
          }),
        ),
        activeProjectId: (parsed.activeProjectId as string) ?? null,
      };
    }
  } catch {
    // Ignore corrupt data
  }
  return { openProjects: [], activeProjectId: null };
}

function saveState(state: ProjectState): void {
  // Save only the lightweight registry to localStorage.
  // Per-project data is persisted to <project>/.belay/state.json via IPC.
  try {
    const registry = {
      openProjects: state.openProjects.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        lastOpened: p.lastOpened.toISOString(),
      })),
      activeProjectId: state.activeProjectId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Save a single project's state (sessions, groups, layout) to .belay/state.json.
 * Called as a side effect whenever the project's state changes.
 */
async function saveProjectToDisk(project: Project): Promise<void> {
  const api = window.electronAPI;
  if (!api) return;

  try {
    const state = {
      sessions: project.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt:
          s.createdAt instanceof Date
            ? s.createdAt.toISOString()
            : String(s.createdAt),
        agentId: s.agentId,
        path: s.path,
      })),
      activeSessionId: project.activeSessionId,
      groups: project.groups,
      layout: project.layout,
    };
    await api.storageSaveState(project.path, state);
  } catch (err) {
    console.error(
      `[ProjectStore] Failed to save project state for ${project.name}:`,
      err,
    );
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
        groups: [],
        layout: [defaultSession.id],
      };

      return {
        openProjects: [...state.openProjects, newProject],
        activeProjectId: newProject.id,
      };
    }

    case "HYDRATE_PROJECT": {
      // Merge state loaded from .belay/state.json into an already-opened project
      const idx = state.openProjects.findIndex(
        (p) => p.id === action.projectId,
      );
      if (idx === -1) return state;
      const existing = state.openProjects[idx];
      // Only hydrate if the project hasn't already been hydrated (sessions still empty)
      if (existing.sessions.length > 0) return state;
      const hydrated: Project = {
        ...existing,
        sessions:
          action.sessions.length > 0 ? action.sessions : existing.sessions,
        activeSessionId: action.activeSessionId,
        groups: action.groups,
        layout: action.layout,
      };
      const openProjects = [...state.openProjects];
      openProjects[idx] = hydrated;
      return { ...state, openProjects };
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
            layout: [...p.layout, action.session.id],
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
            // Also remove session from any group it belongs to
            const updatedGroups = p.groups.map((g) => ({
              ...g,
              sessionIds: g.sessionIds.filter(
                (sid) => sid !== action.sessionId,
              ),
            }));
            return {
              ...p,
              sessions: remaining,
              activeSessionId: newActiveSessionId,
              groups: updatedGroups,
              layout: p.layout.filter((id) => id !== action.sessionId),
            };
          },
        ),
      };
    }

    case "SET_ACTIVE_SESSION": {
      const activeProjectId =
        state.activeProjectId === action.projectId
          ? state.activeProjectId
          : action.projectId;
      return {
        ...state,
        activeProjectId,
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

    case "SET_SESSION_PATH": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === action.sessionId ? { ...s, path: action.path } : s,
            ),
          }),
        ),
      };
    }

    case "REORDER_PROJECTS": {
      const idSet = new Set(action.projectIds);
      const ordered = action.projectIds
        .map((id) => state.openProjects.find((p) => p.id === id))
        .filter((p): p is Project => p !== undefined);
      const remaining = state.openProjects.filter((p) => !idSet.has(p.id));
      return {
        ...state,
        openProjects: [...ordered, ...remaining],
      };
    }

    case "REORDER_SESSIONS": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const idSet = new Set(action.sessionIds);
            const ordered = action.sessionIds
              .map((id) => p.sessions.find((s) => s.id === id))
              .filter((s): s is ChatSession => s !== undefined);
            const remaining = p.sessions.filter((s) => !idSet.has(s.id));
            const newSessions = [...ordered, ...remaining];
            // Keep activeSessionId pointing to the same session; if it no
            // longer exists, fall back to the first session
            const newActiveSessionId = newSessions.some(
              (s) => s.id === p.activeSessionId,
            )
              ? p.activeSessionId
              : (newSessions[0]?.id ?? null);
            return {
              ...p,
              sessions: newSessions,
              activeSessionId: newActiveSessionId,
            };
          },
        ),
      };
    }

    case "CREATE_GROUP": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const group = action.group;
            // If initialSessionIds provided, remove them from other groups first
            const initialIds = new Set(action.initialSessionIds ?? []);
            const cleanedGroups = p.groups.map((g) => ({
              ...g,
              sessionIds: g.sessionIds.filter((sid) => !initialIds.has(sid)),
            }));
            return {
              ...p,
              groups: [...cleanedGroups, group],
              // Add group to layout; remove initial sessions from layout since they're now grouped
              layout: [
                ...p.layout.filter((id) => !initialIds.has(id)),
                group.id,
              ],
            };
          },
        ),
      };
    }

    case "DELETE_GROUP": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const group = p.groups.find((g) => g.id === action.groupId);
            const groupSessionIds = group?.sessionIds ?? [];
            return {
              ...p,
              groups: p.groups.filter((g) => g.id !== action.groupId),
              // Remove group from layout, add its sessions back
              layout: [
                ...p.layout.filter((id) => id !== action.groupId),
                ...groupSessionIds,
              ],
            };
          },
        ),
      };
    }

    case "RENAME_GROUP": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) =>
              g.id === action.groupId ? { ...g, name: action.name } : g,
            ),
          }),
        ),
      };
    }

    case "SET_GROUP_COLOR": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) =>
              g.id === action.groupId ? { ...g, color: action.color } : g,
            ),
          }),
        ),
      };
    }

    case "ADD_SESSION_TO_GROUP": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) => {
              if (g.id !== action.groupId) {
                // Remove from other groups
                return {
                  ...g,
                  sessionIds: g.sessionIds.filter(
                    (sid) => sid !== action.sessionId,
                  ),
                };
              }
              // Add to target group (avoid duplicates)
              if (g.sessionIds.includes(action.sessionId)) return g;
              return {
                ...g,
                sessionIds: [...g.sessionIds, action.sessionId],
              };
            }),
            // Remove session from layout (it's now in a group)
            layout: p.layout.filter((id) => id !== action.sessionId),
          }),
        ),
      };
    }

    case "REMOVE_SESSION_FROM_GROUP": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) =>
              g.id === action.groupId
                ? {
                    ...g,
                    sessionIds: g.sessionIds.filter(
                      (sid) => sid !== action.sessionId,
                    ),
                  }
                : g,
            ),
            // Add session back to layout at the end
            layout: p.layout.includes(action.sessionId)
              ? p.layout
              : [...p.layout, action.sessionId],
          }),
        ),
      };
    }

    case "TOGGLE_GROUP_COLLAPSED": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) =>
              g.id === action.groupId ? { ...g, collapsed: !g.collapsed } : g,
            ),
          }),
        ),
      };
    }

    case "REORDER_GROUPS": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const idSet = new Set(action.groupIds);
            const ordered = action.groupIds
              .map((id) => p.groups.find((g) => g.id === id))
              .filter((g): g is SessionGroup => g !== undefined);
            const remaining = p.groups.filter((g) => !idSet.has(g.id));
            return {
              ...p,
              groups: [...ordered, ...remaining],
            };
          },
        ),
      };
    }

    case "REORDER_GROUP_SESSIONS": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => {
            const targetGroup = p.groups.find((g) => g.id === action.groupId);
            const oldIds = new Set(targetGroup?.sessionIds ?? []);
            // Sessions that are new to the target group weren't in it before
            const newToGroupSet = new Set(
              action.sessionIds.filter((id) => !oldIds.has(id)),
            );
            return {
              ...p,
              groups: p.groups.map((g) => {
                if (g.id === action.groupId) {
                  return { ...g, sessionIds: action.sessionIds };
                }
                // Remove any sessions that moved into the target group
                const movedSet = new Set(action.sessionIds);
                return {
                  ...g,
                  sessionIds: g.sessionIds.filter((sid) => !movedSet.has(sid)),
                };
              }),
              // Remove sessions that just joined the group from layout
              layout: p.layout.filter((id) => !newToGroupSet.has(id)),
            };
          },
        ),
      };
    }

    case "REORDER_LAYOUT": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            layout: action.layout,
          }),
        ),
      };
    }

    case "UNGROUP_SESSION_AT_POSITION": {
      return {
        ...state,
        openProjects: updateProject(
          state.openProjects,
          action.projectId,
          (p) => ({
            ...p,
            groups: p.groups.map((g) => ({
              ...g,
              sessionIds: g.sessionIds.filter(
                (sid) => sid !== action.sessionId,
              ),
            })),
            layout: action.layout,
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

  // Persist lightweight registry to localStorage on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Persist per-project state to .belay/state.json on every state change
  useEffect(() => {
    for (const project of state.openProjects) {
      // Only save projects that have been fully loaded (have sessions populated)
      if (project.sessions.length > 0 || project.groups.length > 0) {
        saveProjectToDisk(project);
      }
    }
  }, [state]);

  // Hydrate a single project's sessions/groups/layout from .belay/state.json
  const hydrateProject = useCallback(
    async (projectId: string, projectPath: string) => {
      const api = window.electronAPI;
      if (!api) return;

      try {
        await api.storageInit(projectPath);
        const saved = await api.storageLoadState(projectPath);

        if (saved) {
          const sessions: ChatSession[] = (saved.sessions ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            createdAt: new Date(s.createdAt),
            agentId: s.agentId ?? null,
            path: s.path ?? undefined,
          }));

          const groups = (saved.groups ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            sessionIds: g.sessionIds ?? [],
            collapsed: g.collapsed ?? false,
          }));

          const layout = saved.layout ?? computeLayout(groups, sessions);
          const activeSessionId =
            saved.activeSessionId ?? sessions[0]?.id ?? null;

          dispatch({
            type: "HYDRATE_PROJECT",
            projectId,
            sessions,
            activeSessionId,
            groups,
            layout,
          });
        }
      } catch (err) {
        console.error(
          `[ProjectStore] Failed to hydrate project ${projectId}:`,
          err,
        );
      }
    },
    [dispatch],
  );

  // On mount, hydrate all projects restored from localStorage with empty sessions
  useEffect(() => {
    const unhydrated = state.openProjects.filter(
      (p) => p.sessions.length === 0 && p.groups.length === 0,
    );
    for (const project of unhydrated) {
      hydrateProject(project.id, project.path);
    }
    // Run once on mount — state.openProjects is the initial loadState() result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProject = useCallback(
    (rawPath: string) => {
      const id = pathToId(rawPath);
      const name = pathToName(rawPath);

      // Dispatch with empty sessions — they'll be loaded from disk asynchronously
      dispatch({
        type: "OPEN_PROJECT",
        project: {
          id,
          name,
          path: rawPath,
          lastOpened: new Date(),
          sessions: [],
          activeSessionId: null,
          groups: [],
          layout: [],
        },
      });

      // Initialize .belay/ storage and hydrate saved state asynchronously
      hydrateProject(id, rawPath);
    },
    [hydrateProject],
  );

  const closeProject = useCallback(
    (projectId: string) => {
      // Side effect: delete message files for all sessions in the project
      const project = state.openProjects.find((p) => p.id === projectId);
      if (project) {
        for (const session of project.sessions) {
          window.electronAPI
            ?.storageDeleteMessages(project.path, session.id)
            .catch((err) => {
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

  const addSession = useCallback(
    (
      projectId: string,
      overrides?: { title?: string; path?: string },
    ): string => {
      const base = makeDefaultSession();
      const session: ChatSession = {
        ...base,
        title: overrides?.title ?? base.title,
        path: overrides?.path,
      };
      dispatch({ type: "ADD_SESSION", projectId, session });
      return session.id;
    },
    [],
  );

  const removeSession = useCallback(
    (projectId: string, sessionId: string) => {
      // Check if this is the last session — if so, auto-create a new one
      const project = state.openProjects.find((p) => p.id === projectId);
      const isLast = project && project.sessions.length <= 1;

      dispatch({ type: "REMOVE_SESSION", projectId, sessionId });
      // Side effect: delete the persisted message file for this session
      window.electronAPI
        ?.storageDeleteMessages(project?.path ?? "", sessionId)
        .catch((err) => {
          console.error(
            `[ProjectStore] Failed to delete session messages for ${sessionId}:`,
            err,
          );
        });

      // Auto-create a fresh session so the project is never empty
      if (isLast) {
        addSession(projectId);
      }
    },
    [state.openProjects, addSession],
  );

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

  const setSessionPath = useCallback(
    (projectId: string, sessionId: string, path: string | undefined) => {
      dispatch({ type: "SET_SESSION_PATH", projectId, sessionId, path });
    },
    [],
  );

  const reorderProjects = useCallback((projectIds: string[]) => {
    dispatch({ type: "REORDER_PROJECTS", projectIds });
  }, []);

  const reorderSessions = useCallback(
    (projectId: string, sessionIds: string[]) => {
      dispatch({ type: "REORDER_SESSIONS", projectId, sessionIds });
    },
    [],
  );

  // ── Group actions ────────────────────────────────────────────────

  const createGroup = useCallback(
    (
      projectId: string,
      name: string,
      color: string,
      initialSessionIds?: string[],
    ): string => {
      const group: SessionGroup = {
        id: crypto.randomUUID(),
        name,
        color,
        sessionIds: initialSessionIds ?? [],
        collapsed: false,
      };
      dispatch({
        type: "CREATE_GROUP",
        projectId,
        group,
        initialSessionIds,
      });
      return group.id;
    },
    [],
  );

  const deleteGroup = useCallback((projectId: string, groupId: string) => {
    dispatch({ type: "DELETE_GROUP", projectId, groupId });
  }, []);

  const renameGroup = useCallback(
    (projectId: string, groupId: string, name: string) => {
      dispatch({ type: "RENAME_GROUP", projectId, groupId, name });
    },
    [],
  );

  const setGroupColor = useCallback(
    (projectId: string, groupId: string, color: string) => {
      dispatch({ type: "SET_GROUP_COLOR", projectId, groupId, color });
    },
    [],
  );

  const addSessionToGroup = useCallback(
    (projectId: string, groupId: string, sessionId: string) => {
      dispatch({
        type: "ADD_SESSION_TO_GROUP",
        projectId,
        groupId,
        sessionId,
      });
    },
    [],
  );

  const removeSessionFromGroup = useCallback(
    (projectId: string, groupId: string, sessionId: string) => {
      dispatch({
        type: "REMOVE_SESSION_FROM_GROUP",
        projectId,
        groupId,
        sessionId,
      });
    },
    [],
  );

  const toggleGroupCollapsed = useCallback(
    (projectId: string, groupId: string) => {
      dispatch({ type: "TOGGLE_GROUP_COLLAPSED", projectId, groupId });
    },
    [],
  );

  const reorderGroups = useCallback((projectId: string, groupIds: string[]) => {
    dispatch({ type: "REORDER_GROUPS", projectId, groupIds });
  }, []);

  const reorderGroupSessions = useCallback(
    (projectId: string, groupId: string, sessionIds: string[]) => {
      dispatch({
        type: "REORDER_GROUP_SESSIONS",
        projectId,
        groupId,
        sessionIds,
      });
    },
    [],
  );

  const reorderLayout = useCallback((projectId: string, layout: string[]) => {
    dispatch({ type: "REORDER_LAYOUT", projectId, layout });
  }, []);

  const ungroupSessionAtPosition = useCallback(
    (projectId: string, sessionId: string, layout: string[]) => {
      dispatch({
        type: "UNGROUP_SESSION_AT_POSITION",
        projectId,
        sessionId,
        layout,
      });
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
        setSessionPath,
        reorderProjects,
        reorderSessions,
        createGroup,
        deleteGroup,
        renameGroup,
        setGroupColor,
        addSessionToGroup,
        removeSessionFromGroup,
        toggleGroupCollapsed,
        reorderGroups,
        reorderGroupSessions,
        reorderLayout,
        ungroupSessionAtPosition,
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
