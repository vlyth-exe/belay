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

  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximize: (callback: () => void) => void;
  onUnmaximize: (callback: () => void) => void;

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
  acpDisconnect: () => Promise<void>;
  acpGetConnectionState: () => Promise<AcpConnectionState>;
  acpOnConnectionStateChange: (
    callback: (state: AcpConnectionState) => void,
  ) => void;

  // ACP - Errors
  acpOnError: (
    callback: (error: { message: string; stderr: string }) => void,
  ) => void;

  // ACP - Session
  acpCreateSession: (cwd?: string) => Promise<AcpSessionInfo>;
  acpGetActiveSession: () => Promise<AcpSessionInfo | null>;

  // ACP - Prompt
  acpSendPrompt: (sessionId: string, content: string) => Promise<void>;
  acpCancelPrompt: (sessionId: string) => Promise<void>;

  // ACP - Streaming updates
  acpOnUpdate: (
    callback: (
      update: AcpMessageChunk | AcpToolCallUpdate | AcpPlanUpdate,
    ) => void,
  ) => void;

  // ACP - Permissions
  acpOnPermissionRequest: (
    callback: (request: AcpPermissionRequest) => void,
  ) => void;
  acpRespondPermission: (requestId: string, optionId: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
