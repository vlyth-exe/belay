export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  sessions: ChatSession[];
  activeSessionId: string | null;
  groups: SessionGroup[];
  /** Ordered IDs of groups and ungrouped sessions for sidebar rendering. */
  layout: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  agentId: string | null;
  /** Optional working directory override (e.g. for worktree sessions). */
  path?: string;
}

export interface SessionGroup {
  id: string;
  name: string;
  color: string;
  sessionIds: string[];
  collapsed: boolean;
}
