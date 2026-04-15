/**
 * Shared types for the block-based chat message model.
 *
 * Each assistant turn is an ordered list of blocks that render sequentially,
 * e.g. think → say → call tool → think → answer.
 */

// ── Tool call info ─────────────────────────────────────────────────────

export interface ToolCallInfo {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  arguments?: string;
  output?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ── Message blocks ─────────────────────────────────────────────────────

export interface ThinkingMessageBlock {
  id: string;
  type: "thinking";
  content: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TextMessageBlock {
  id: string;
  type: "text";
  content: string;
}

export interface ToolCallMessageBlock {
  id: string;
  type: "tool_call";
  toolCall: ToolCallInfo;
}

export interface PermissionOption {
  id: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface PermissionRequestInfo {
  requestId: string;
  reason?: string;
  toolCall?: {
    toolCallId: string;
    title?: string;
    kind?: string;
  };
  options: PermissionOption[];
}

export interface PermissionRequestMessageBlock {
  id: string;
  type: "permission_request";
  permission: PermissionRequestInfo;
}

/** A single sequential block within a message. */
export type MessageBlock =
  | ThinkingMessageBlock
  | TextMessageBlock
  | ToolCallMessageBlock
  | PermissionRequestMessageBlock;

// ── Message ────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Ordered list of content blocks that render top-to-bottom. */
  blocks: MessageBlock[];
  timestamp: Date;
  /** True while the agent is still producing blocks for this message. */
  isStreaming?: boolean;
  /** When the response finished streaming. */
  completedAt?: Date;
}
