// Types for the ACP (Agent Client Protocol) integration

/** Agent metadata from the ACP registry */
export interface AcpAgentManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  repository?: string;
  website?: string;
  authors?: string[];
  license?: string;
  icon?: string;
  distribution: {
    npx?: {
      package: string;
      args?: string[];
      env?: Record<string, string>;
    };
    binary?: {
      [platform: string]: {
        archive: string;
        cmd: string;
        args?: string[];
      };
    };
    uvx?: {
      package: string;
      args?: string[];
    };
  };
}

/** A locally installed/configured agent harness */
export interface HarnessConfig {
  agentId: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  /** The command to spawn (e.g. "npx" or a path to a binary) */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Environment variables to pass to the subprocess */
  env: Record<string, string>;
  /** Working directory for the agent */
  cwd?: string;
  /** MCP server configurations to pass to the agent */
  mcpServers?: McpServerConfig[];
  /** On Windows, run the agent inside WSL (Windows Subsystem for Linux) */
  useWsl?: boolean;
  /** Optional WSL distribution name (e.g. "Ubuntu"). Defaults to the default distro if not set. */
  wslDistro?: string;
  /** Linux binary command (populated from the linux-* distribution entry for WSL use) */
  linuxCommand?: string;
  /** Linux binary args (populated from the linux-* distribution entry for WSL use) */
  linuxArgs?: string[];
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Connection state of the ACP client */
export type AcpConnectionState =
  | "disconnected"
  | "initializing"
  | "ready"
  | "error";

/** Information about an active ACP session */
export interface AcpSessionInfo {
  sessionId: string;
  agentName: string;
  agentId: string;
}

/** Streaming message chunk from an agent */
export interface AcpMessageChunk {
  type: "agent_message_chunk" | "user_message_chunk" | "thought_chunk";
  content: string;
  sessionId: string;
}

/** Tool call status update from agent */
export interface AcpToolCallUpdate {
  toolCallId: string;
  toolName: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  content?: string;
  arguments?: string;
  sessionId: string;
}

/** Permission request from an agent */
export interface AcpPermissionRequest {
  requestId: string;
  sessionId: string;
  options: AcpPermissionOption[];
  reason?: string;
  toolCall?: AcpPermissionToolCall;
}

export interface AcpPermissionOption {
  id: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface AcpPermissionToolCall {
  toolCallId: string;
  title?: string;
  kind?: string;
}

/** Plan update from an agent */
export interface AcpPlanUpdate {
  sessionId: string;
  entries: AcpPlanEntry[];
}

export interface AcpPlanEntry {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority?: "high" | "medium" | "low";
}

// ── Slash commands ─────────────────────────────────────────────────────

/** A slash command exposed by the connected ACP agent. */
export interface AcpAvailableCommand {
  name: string;
  description: string;
  input?: AcpCommandInput | null;
}

/** Hint shown when a command expects free-form text after its name. */
export interface AcpCommandInput {
  hint: string;
}

/** Payload for the "available_commands_update" session update. */
export interface AcpAvailableCommandsUpdate {
  availableCommands: AcpAvailableCommand[];
}

// ── Extended message types ─────────────────────────────────────────────

/** Extended message type for the chat that supports tool calls and streaming */
export interface AcpChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** For assistant messages, tracks whether this is still streaming */
  isStreaming?: boolean;
  /** Tool calls associated with this message */
  toolCalls?: AcpToolCallInfo[];
}

export interface AcpToolCallInfo {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  arguments?: string;
  output?: string;
}

// ── Session modes ──────────────────────────────────────────────────────

/** A mode that an agent can operate in */
export interface AcpSessionMode {
  id: string;
  name: string;
  description?: string | null;
}

/** The current mode state for a session */
export interface AcpSessionModeState {
  currentModeId: string;
  availableModes: AcpSessionMode[];
}
