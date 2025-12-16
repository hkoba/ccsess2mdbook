import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  extractConversationTurns,
  getSessionMetadata,
} from "../src/converter.ts";
import type {
  UserMessage,
  AssistantMessage,
  SessionEntry,
  FileHistorySnapshot,
  SummaryEntry,
} from "../src/types.ts";

// =============================================================================
// Helper functions
// =============================================================================

function createUserMessage(
  uuid: string,
  content: string | Array<{ type: string; text?: string; tool_use_id?: string; content?: string }>,
  timestamp = "2025-01-01T00:00:00Z"
): UserMessage {
  return {
    type: "user",
    uuid,
    parentUuid: "",
    sessionId: "test-session",
    timestamp,
    cwd: "/test",
    message: {
      role: "user",
      content: content as UserMessage["message"]["content"],
    },
  };
}

function createAssistantMessage(
  uuid: string,
  contentBlocks: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }>,
  timestamp = "2025-01-01T00:00:01Z"
): AssistantMessage {
  return {
    type: "assistant",
    uuid,
    parentUuid: "",
    sessionId: "test-session",
    timestamp,
    cwd: "/test",
    message: {
      role: "assistant",
      content: contentBlocks as AssistantMessage["message"]["content"],
    },
  };
}

function createFileHistorySnapshot(messageId: string): FileHistorySnapshot {
  return {
    type: "file-history-snapshot",
    messageId,
    snapshot: {},
  };
}

function createSummaryEntry(): SummaryEntry {
  return {
    type: "summary",
    summary: "Test summary",
    leafUuid: "test-uuid",
  };
}

// =============================================================================
// extractConversationTurns tests
// =============================================================================

Deno.test("extractConversationTurns - Simple conversation", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Hello"),
    createAssistantMessage("asst1", [{ type: "text", text: "Hi!" }]),
  ];

  const turns = extractConversationTurns(entries);

  assertEquals(turns.length, 1);
  assertEquals(turns[0].index, 1);
  assertEquals(turns[0].messages.length, 2);
});

Deno.test("extractConversationTurns - Multiple turns", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Hello"),
    createAssistantMessage("asst1", [{ type: "text", text: "Hi!" }]),
    createUserMessage("user2", "How are you?"),
    createAssistantMessage("asst2", [{ type: "text", text: "I'm good!" }]),
  ];

  const turns = extractConversationTurns(entries);

  assertEquals(turns.length, 2);
  assertEquals(turns[0].index, 1);
  assertEquals(turns[1].index, 2);
});

Deno.test("extractConversationTurns - Filters out file-history-snapshot", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Hello"),
    createFileHistorySnapshot("snap1"),
    createAssistantMessage("asst1", [{ type: "text", text: "Hi!" }]),
  ];

  const turns = extractConversationTurns(entries);

  assertEquals(turns.length, 1);
  assertEquals(turns[0].messages.length, 2);
});

Deno.test("extractConversationTurns - User with tool_result stays in same turn", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Read a file"),
    createAssistantMessage("asst1", [
      { type: "tool_use", id: "tool1", name: "Read", input: { file_path: "/test.txt" } }
    ]),
    createUserMessage("user2", [
      { type: "tool_result", tool_use_id: "tool1", content: "file content" }
    ]),
    createAssistantMessage("asst2", [{ type: "text", text: "Done!" }]),
  ];

  const turns = extractConversationTurns(entries);

  // All should be in one turn because user2 has only tool_result
  assertEquals(turns.length, 1);
  assertEquals(turns[0].messages.length, 4);
});

Deno.test("extractConversationTurns - New turn on user with text", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "First question"),
    createAssistantMessage("asst1", [{ type: "text", text: "Answer 1" }]),
    createUserMessage("user2", "Second question"),
    createAssistantMessage("asst2", [{ type: "text", text: "Answer 2" }]),
  ];

  const turns = extractConversationTurns(entries);

  assertEquals(turns.length, 2);
  assertEquals(turns[0].messages.length, 2);
  assertEquals(turns[1].messages.length, 2);
});

Deno.test("extractConversationTurns - Multiple tool interactions in one turn", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Do multiple things"),
    createAssistantMessage("asst1", [
      { type: "tool_use", id: "tool1", name: "Read", input: { file_path: "/a.txt" } }
    ]),
    createUserMessage("user2", [
      { type: "tool_result", tool_use_id: "tool1", content: "content a" }
    ]),
    createAssistantMessage("asst2", [
      { type: "tool_use", id: "tool2", name: "Read", input: { file_path: "/b.txt" } }
    ]),
    createUserMessage("user3", [
      { type: "tool_result", tool_use_id: "tool2", content: "content b" }
    ]),
    createAssistantMessage("asst3", [{ type: "text", text: "All done!" }]),
  ];

  const turns = extractConversationTurns(entries);

  // All should be in one turn
  assertEquals(turns.length, 1);
  assertEquals(turns[0].messages.length, 6);
});

Deno.test("extractConversationTurns - Empty entries returns empty array", () => {
  const entries: SessionEntry[] = [];
  const turns = extractConversationTurns(entries);
  assertEquals(turns.length, 0);
});

Deno.test("extractConversationTurns - Only file-history-snapshot returns empty", () => {
  const entries: SessionEntry[] = [
    createFileHistorySnapshot("snap1"),
    createFileHistorySnapshot("snap2"),
  ];

  const turns = extractConversationTurns(entries);
  assertEquals(turns.length, 0);
});

// =============================================================================
// getSessionMetadata tests
// =============================================================================

Deno.test("getSessionMetadata - Extracts session info", () => {
  const entries: SessionEntry[] = [
    createUserMessage("user1", "Hello", "2025-01-01T10:00:00Z"),
    createAssistantMessage("asst1", [{ type: "text", text: "Hi!" }], "2025-01-01T10:00:05Z"),
  ];

  const metadata = getSessionMetadata(entries);

  assertEquals(metadata.sessionId, "test-session");
  assertEquals(metadata.startTime, "2025-01-01T10:00:00Z");
  assertEquals(metadata.endTime, "2025-01-01T10:00:05Z");
});

Deno.test("getSessionMetadata - Empty entries returns nulls", () => {
  const entries: SessionEntry[] = [];
  const metadata = getSessionMetadata(entries);

  assertEquals(metadata.sessionId, null);
  assertEquals(metadata.startTime, null);
  assertEquals(metadata.endTime, null);
});

Deno.test("getSessionMetadata - Only file-history-snapshot returns nulls", () => {
  const entries: SessionEntry[] = [
    createFileHistorySnapshot("snap1"),
  ];

  const metadata = getSessionMetadata(entries);

  assertEquals(metadata.sessionId, null);
  assertEquals(metadata.startTime, null);
  assertEquals(metadata.endTime, null);
});

Deno.test("getSessionMetadata - Ignores summary entries", () => {
  const entries: SessionEntry[] = [
    createSummaryEntry(),
    createUserMessage("user1", "Hello", "2025-01-01T10:00:00Z"),
  ];

  const metadata = getSessionMetadata(entries);

  assertEquals(metadata.sessionId, "test-session");
  assertEquals(metadata.startTime, "2025-01-01T10:00:00Z");
});
