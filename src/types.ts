// Content block types for messages

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ToolResultContent[];
  is_error?: boolean;
}

export interface ToolResultContent {
  type: "text";
  text: string;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

// Message types

export interface UserMessage {
  type: "user";
  uuid: string;
  parentUuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
}

export interface AssistantMessage {
  type: "assistant";
  uuid: string;
  parentUuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  message: {
    role: "assistant";
    content: ContentBlock[];
    model?: string;
    stop_reason?: string;
  };
}

export interface FileHistorySnapshot {
  type: "file-history-snapshot";
  messageId: string;
  snapshot: unknown;
}

export type SessionEntry = UserMessage | AssistantMessage | FileHistorySnapshot;

// Conversation structure

export interface ConversationTurn {
  index: number;
  user: UserMessage;
  assistants: AssistantMessage[];
}

// Render options

export interface RenderOptions {
  hideThinking: boolean;
  hideToolResults: boolean;
  collapseTools: boolean;
}

// Book configuration

export interface BookConfig {
  title: string;
  authors?: string[];
  description?: string;
  language?: string;
}
