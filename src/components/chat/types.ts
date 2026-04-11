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
}

// ── Message blocks ─────────────────────────────────────────────────────

export interface ThinkingMessageBlock {
  id: string;
  type: "thinking";
  content: string;
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

/** A single sequential block within a message. */
export type MessageBlock =
  | ThinkingMessageBlock
  | TextMessageBlock
  | ToolCallMessageBlock;

// ── Message ────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Ordered list of content blocks that render top-to-bottom. */
  blocks: MessageBlock[];
  timestamp: Date;
  /** True while the agent is still producing blocks for this message. */
  isStreaming?: boolean;
}
