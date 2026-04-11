import type {
  AcpAgentManifest,
  HarnessConfig,
  AcpConnectionState,
  AcpSessionInfo,
  AcpMessageChunk,
  AcpToolCallUpdate,
  AcpPermissionRequest,
  AcpPlanUpdate,
} from "./acp";

export interface ElectronAPI {
  // Project
  projectOpenDirectory: () => Promise<string | null>;

  // Session persistence
  sessionLoadMessages: (
    sessionId: string,
  ) => Promise<Record<string, unknown>[]>;
  sessionSaveMessages: (
    sessionId: string,
    messages: unknown[],
  ) => Promise<void>;
  sessionDeleteMessages: (sessionId: string) => Promise<void>;

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
  acpCreateSession: (agentId: string, cwd?: string) => Promise<AcpSessionInfo>;

  // ACP - Prompt
  acpSendPrompt: (
    agentId: string,
    sessionId: string,
    content: string,
  ) => Promise<void>;
  acpCancelPrompt: (agentId: string, sessionId: string) => Promise<void>;

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
