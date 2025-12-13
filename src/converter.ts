import type {
  AssistantMessage,
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
 * Extract conversation turns from session entries
 *
 * A turn consists of a user message followed by one or more assistant messages.
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
      // Start a new turn
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = {
        index: turnIndex++,
        user: msg,
        assistants: [],
      };
    } else if (isAssistantMessage(msg) && currentTurn) {
      // Add to current turn
      currentTurn.assistants.push(msg);
    }
  }

  // Don't forget the last turn
  if (currentTurn && currentTurn.assistants.length > 0) {
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
