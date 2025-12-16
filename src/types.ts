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

export interface SummaryEntry {
  type: "summary";
  summary: string;
  leafUuid: string;
}

export type SessionEntry = UserMessage | AssistantMessage | FileHistorySnapshot | SummaryEntry;

// Conversation structure
// A turn is a sequence of messages starting with a user text message
// and including all subsequent tool interactions until the next user text message

export type TurnMessage = UserMessage | AssistantMessage;

export interface ConversationTurn {
  index: number;
  messages: TurnMessage[];  // Sequence of user and assistant messages
}

// Render options

export interface RenderOptions {
  hideThinking: boolean;
  hideToolResults: boolean;
  hideReadResults: boolean;
  collapseTools: boolean;
}

// Tool tracking for associating tool_use with tool_result

export type ToolUseMap = Map<string, ToolUseBlock>;

// Book configuration

export interface BookConfig {
  title: string;
  authors?: string[];
  description?: string;
  language?: string;
}

// Page structure for rendering
// Each turn is split into multiple pages:
// - UserPage: user's text prompt
// - TextPage: assistant message starting with text content
// - ToolPage: grouped tool_use calls and their tool_result responses

export interface UserPage {
  type: "user";
  turnIndex: number;
  pageIndex: number;
  user: UserMessage;
}

// Assistant message that starts with text content
export interface TextPage {
  type: "text";
  turnIndex: number;
  pageIndex: number;
  assistant: AssistantMessage;
}

// Grouped tool interactions: multiple tool_use calls and their results
export interface ToolInteraction {
  toolUse: AssistantMessage;  // assistant message with tool_use
  toolResults: ToolResultBlock[];  // corresponding tool_result blocks
}

export interface ToolPage {
  type: "tool";
  turnIndex: number;
  pageIndex: number;
  interactions: ToolInteraction[];  // Multiple tool_use + results grouped together
}

export type Page = UserPage | TextPage | ToolPage;

export interface TurnPages {
  turnIndex: number;
  title: string;  // From first user text
  pages: Page[];
}
