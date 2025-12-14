import type {
  AssistantMessage,
  ContentBlock,
  ConversationTurn,
  SessionEntry,
  UserMessage,
} from "./types.ts";

/**
 * Check if entry is a user message
 */
function isUserMessage(entry: SessionEntry): entry is UserMessage {
  return entry.type === "user";
}

/**
 * Check if entry is an assistant message
 */
function isAssistantMessage(entry: SessionEntry): entry is AssistantMessage {
  return entry.type === "assistant";
}

/**
 * Check if user message contains text content (not just tool_result)
 */
function userMessageHasText(user: UserMessage): boolean {
  const content = user.message.content;

  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  // Check if any block is a text block with non-empty content
  for (const block of content) {
    if (block.type === "text" && block.text.trim().length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Extract conversation turns from session entries
 *
 * A turn is a sequence of messages starting with a user message that contains text,
 * and includes all subsequent tool interactions (user tool_result + assistant responses)
 * until the next user message with text.
 */
export function extractConversationTurns(
  entries: SessionEntry[]
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];

  // Filter to only user and assistant messages
  const messages = entries.filter(
    (e): e is UserMessage | AssistantMessage =>
      isUserMessage(e) || isAssistantMessage(e)
  );

  let currentTurn: ConversationTurn | null = null;
  let turnIndex = 1;

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      if (userMessageHasText(msg)) {
        // User message with text starts a new turn
        if (currentTurn && currentTurn.messages.length > 0) {
          turns.push(currentTurn);
        }
        currentTurn = {
          index: turnIndex++,
          messages: [msg],
        };
      } else {
        // User message with only tool_result continues current turn
        if (currentTurn) {
          currentTurn.messages.push(msg);
        }
      }
    } else if (isAssistantMessage(msg) && currentTurn) {
      // Add assistant message to current turn
      currentTurn.messages.push(msg);
    }
  }

  // Don't forget the last turn
  if (currentTurn && currentTurn.messages.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Get session metadata from entries
 */
export function getSessionMetadata(entries: SessionEntry[]): {
  sessionId: string | null;
  startTime: string | null;
  endTime: string | null;
} {
  let sessionId: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;

  for (const entry of entries) {
    if (entry.type === "user" || entry.type === "assistant") {
      if (!sessionId && entry.sessionId) {
        sessionId = entry.sessionId;
      }
      if (!startTime && entry.timestamp) {
        startTime = entry.timestamp;
      }
      if (entry.timestamp) {
        endTime = entry.timestamp;
      }
    }
  }

  return { sessionId, startTime, endTime };
}
