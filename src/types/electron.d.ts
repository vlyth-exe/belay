import type {
  AcpAgentManifest,
  HarnessConfig,
  AcpConnectionState,
  AcpMessageChunk,
  AcpToolCallUpdate,
  AcpPermissionRequest,
  AcpPlanUpdate,
} from "./acp";
import type {
  GitStatus,
  GitLogEntry,
  GitBranch,
  GitDiffStat,
  GitWorktree,
  GitError,
} from "./git";

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifiedAt: number | null;
}

export interface ElectronAPI {
  // Project
  projectOpenDirectory: () => Promise<string | null>;

  // Dialog
  dialogOpenFile: () => Promise<string | null>;

  // Session persistence
  sessionLoadMessages: (
    sessionId: string,
  ) => Promise<Record<string, unknown>[]>;
  sessionSaveMessages: (
    sessionId: string,
    messages: unknown[],
  ) => Promise<void>;
  sessionDeleteMessages: (sessionId: string) => Promise<void>;

  // Notifications
  notificationSend: (
    title: string,
    body: string,
    sessionVisible: boolean,
    projectId: string,
    sessionId: string,
  ) => void;
  onNotificationClick: (
    callback: (data: { projectId: string; sessionId: string }) => void,
  ) => () => void;

  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximize: (callback: () => void) => () => void;
  onUnmaximize: (callback: () => void) => () => void;

  // ACP - Registry & Harness
  acpListRegistry: () => Promise<AcpAgentManifest[]>;
  acpListInstalled: () => Promise<HarnessConfig[]>;
  acpInstallHarness: (manifest: AcpAgentManifest) => Promise<void>;
  acpUninstallHarness: (agentId: string) => Promise<void>;
  acpUpdateHarness: (
    agentId: string,
    updates: {
      cwd?: string;
      env?: Record<string, string>;
      mcpServers?: unknown[];
      args?: string[];
      command?: string;
      useWsl?: boolean;
      wslDistro?: string;
      linuxCommand?: string;
      linuxArgs?: string[];
    },
  ) => Promise<void>;

  // ACP - Connection lifecycle
  acpConnect: (agentId: string) => Promise<void>;
  acpDisconnect: (agentId: string) => Promise<void>;
  acpGetConnectionState: (agentId: string) => Promise<AcpConnectionState>;
  acpOnConnectionStateChange: (
    callback: (event: { agentId: string; state: AcpConnectionState }) => void,
  ) => () => void;

  // ACP - Errors
  acpOnError: (
    callback: (event: {
      agentId: string;
      message: string;
      stderr: string;
    }) => void,
  ) => () => void;

  // ACP - Session
  acpCreateSession: (
    agentId: string,
    cwd?: string,
  ) => Promise<{
    sessionId: string;
    modes?: {
      currentModeId: string;
      availableModes: Array<{
        id: string;
        name: string;
        description?: string | null;
      }>;
    } | null;
  }>;

  // ACP - Prompt
  acpSendPrompt: (
    agentId: string,
    sessionId: string,
    content: string,
  ) => Promise<void>;
  acpCancelPrompt: (agentId: string, sessionId: string) => Promise<void>;
  acpSetSessionMode: (
    agentId: string,
    sessionId: string,
    modeId: string,
  ) => Promise<void>;

  // ACP - Streaming updates
  acpOnUpdate: (
    callback: (
      update: AcpMessageChunk | AcpToolCallUpdate | AcpPlanUpdate,
    ) => void,
  ) => () => void;

  // ACP - Permissions
  acpOnPermissionRequest: (
    callback: (request: AcpPermissionRequest) => void,
  ) => () => void;
  acpRespondPermission: (requestId: string, optionId: string) => Promise<void>;

  // File system - Directory explorer
  fsReadDir: (dirPath: string) => Promise<DirEntry[]>;

  // Git
  gitIsRepo: (dirPath: string) => Promise<boolean>;
  gitStatus: (dirPath: string) => Promise<{
    data: GitStatus | null;
    error: GitError | null;
  }>;
  gitLog: (
    dirPath: string,
    maxCount?: number,
  ) => Promise<{
    data: GitLogEntry[] | null;
    error: GitError | null;
  }>;
  gitBranches: (dirPath: string) => Promise<{
    data: GitBranch[] | null;
    error: GitError | null;
  }>;
  gitDiffSummary: (
    dirPath: string,
    staged?: boolean,
  ) => Promise<{
    data: GitDiffStat[] | null;
    error: GitError | null;
  }>;
  gitStage: (
    dirPath: string,
    ...files: string[]
  ) => Promise<GitError | null>;
  gitUnstage: (
    dirPath: string,
    ...files: string[]
  ) => Promise<GitError | null>;
  gitCommit: (
    dirPath: string,
    message: string,
  ) => Promise<{
    data: string | null;
    error: GitError | null;
  }>;
  gitPush: (dirPath: string) => Promise<GitError | null>;
  gitPull: (dirPath: string) => Promise<GitError | null>;
  gitFetch: (dirPath: string) => Promise<GitError | null>;
  gitCheckout: (
    dirPath: string,
    branch: string,
  ) => Promise<GitError | null>;
  gitCreateBranch: (
    dirPath: string,
    name: string,
    checkout?: boolean,
  ) => Promise<GitError | null>;
  gitListWorktrees: (dirPath: string) => Promise<{
    data: GitWorktree[] | null;
    error: GitError | null;
  }>;
  gitCreateWorktree: (
    dirPath: string,
    branch: string,
    targetPath: string,
  ) => Promise<GitError | null>;
  gitRemoveWorktree: (
    dirPath: string,
    worktreePath: string,
    force?: boolean,
  ) => Promise<GitError | null>;

  // Terminal
  terminalSpawn: (
    id: string,
    cwd?: string,
    options?: {
      shell?: string;
      args?: string[];
      isWsl?: boolean;
      wslDistro?: string;
    },
  ) => Promise<void>;
  terminalWrite: (id: string, data: string) => void;
  terminalResize: (id: string, cols: number, rows: number) => void;
  terminalKill: (id: string) => void;
  onTerminalData: (id: string, callback: (data: string) => void) => () => void;
  onTerminalExit: (
    id: string,
    callback: (exitCode: number) => void,
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
