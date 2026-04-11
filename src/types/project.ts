export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  sessions: ChatSession[];
  activeSessionId: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  agentId: string | null;
}
