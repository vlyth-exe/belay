export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  sessions: ChatSession[];
  activeSessionId: string | null;
  groups: SessionGroup[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  agentId: string | null;
}

export interface SessionGroup {
  id: string;
  name: string;
  color: string;
  sessionIds: string[];
  collapsed: boolean;
}
