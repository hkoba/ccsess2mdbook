import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  getLanguageFromExtension,
  getBackquoteCount,
  getCommentPrefix,
  generateBookToml,
  getPageFilename,
  convertTurnsToPages,
  buildToolUseMap,
} from "../src/renderer.ts";
import type {
  BookConfig,
  ConversationTurn,
  UserMessage,
  AssistantMessage,
  UserPage,
  TextPage,
  ToolPage,
} from "../src/types.ts";

// =============================================================================
// getLanguageFromExtension tests
// =============================================================================

Deno.test("getLanguageFromExtension - JavaScript files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.js"), "javascript");
  assertEquals(getLanguageFromExtension("/path/to/file.jsx"), "jsx");
});

Deno.test("getLanguageFromExtension - TypeScript files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.ts"), "typescript");
  assertEquals(getLanguageFromExtension("/path/to/file.tsx"), "tsx");
});

Deno.test("getLanguageFromExtension - Perl files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.pl"), "perl");
  assertEquals(getLanguageFromExtension("/path/to/file.pm"), "perl");
});

Deno.test("getLanguageFromExtension - Python files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.py"), "python");
});

Deno.test("getLanguageFromExtension - Shell files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.sh"), "bash");
  assertEquals(getLanguageFromExtension("/path/to/file.bash"), "bash");
  assertEquals(getLanguageFromExtension("/path/to/file.zsh"), "zsh");
});

Deno.test("getLanguageFromExtension - Config files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.yaml"), "yaml");
  assertEquals(getLanguageFromExtension("/path/to/file.yml"), "yaml");
  assertEquals(getLanguageFromExtension("/path/to/file.toml"), "toml");
  assertEquals(getLanguageFromExtension("/path/to/file.json"), "json");
});

Deno.test("getLanguageFromExtension - Markdown files", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.md"), "markdown");
  assertEquals(getLanguageFromExtension("/path/to/file.markdown"), "markdown");
});

Deno.test("getLanguageFromExtension - Unknown extension returns extension", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.xyz"), "xyz");
  assertEquals(getLanguageFromExtension("/path/to/file.unknown"), "unknown");
});

Deno.test("getLanguageFromExtension - Case insensitive", () => {
  assertEquals(getLanguageFromExtension("/path/to/file.JS"), "javascript");
  assertEquals(getLanguageFromExtension("/path/to/file.PY"), "python");
});

// =============================================================================
// getBackquoteCount tests
// =============================================================================

Deno.test("getBackquoteCount - No backquotes returns 3 for non-markdown", () => {
  assertEquals(getBackquoteCount("hello world", false), 3);
});

Deno.test("getBackquoteCount - No backquotes returns 4 for markdown", () => {
  assertEquals(getBackquoteCount("hello world", true), 4);
});

Deno.test("getBackquoteCount - Content with 3 backquotes returns 4", () => {
  assertEquals(getBackquoteCount("```code```", false), 4);
});

Deno.test("getBackquoteCount - Content with 4 backquotes returns 5", () => {
  assertEquals(getBackquoteCount("````code````", false), 5);
});

Deno.test("getBackquoteCount - Markdown with 3 backquotes returns 4", () => {
  assertEquals(getBackquoteCount("```code```", true), 4);
});

Deno.test("getBackquoteCount - Markdown with 5 backquotes returns 6", () => {
  assertEquals(getBackquoteCount("`````code`````", true), 6);
});

// =============================================================================
// getCommentPrefix tests
// =============================================================================

Deno.test("getCommentPrefix - C-style languages", () => {
  assertEquals(getCommentPrefix("javascript"), { start: "// " });
  assertEquals(getCommentPrefix("typescript"), { start: "// " });
  assertEquals(getCommentPrefix("java"), { start: "// " });
  assertEquals(getCommentPrefix("go"), { start: "// " });
  assertEquals(getCommentPrefix("rust"), { start: "// " });
});

Deno.test("getCommentPrefix - Hash comment languages", () => {
  assertEquals(getCommentPrefix("perl"), { start: "# " });
  assertEquals(getCommentPrefix("python"), { start: "# " });
  assertEquals(getCommentPrefix("ruby"), { start: "# " });
  assertEquals(getCommentPrefix("bash"), { start: "# " });
  assertEquals(getCommentPrefix("yaml"), { start: "# " });
});

Deno.test("getCommentPrefix - HTML/XML block comments", () => {
  assertEquals(getCommentPrefix("html"), { start: "<!-- ", end: " -->" });
  assertEquals(getCommentPrefix("xml"), { start: "<!-- ", end: " -->" });
  assertEquals(getCommentPrefix("markdown"), { start: "<!-- ", end: " -->" });
});

Deno.test("getCommentPrefix - CSS block comments", () => {
  assertEquals(getCommentPrefix("css"), { start: "/* ", end: " */" });
  assertEquals(getCommentPrefix("scss"), { start: "/* ", end: " */" });
});

Deno.test("getCommentPrefix - Lua/Haskell double dash", () => {
  assertEquals(getCommentPrefix("lua"), { start: "-- " });
  assertEquals(getCommentPrefix("haskell"), { start: "-- " });
  assertEquals(getCommentPrefix("sql"), { start: "-- " });
});

Deno.test("getCommentPrefix - Unknown language defaults to hash", () => {
  assertEquals(getCommentPrefix("unknown"), { start: "# " });
});

// =============================================================================
// generateBookToml tests
// =============================================================================

Deno.test("generateBookToml - Basic config", () => {
  const config: BookConfig = { title: "Test Book" };
  const result = generateBookToml(config);

  assertEquals(result.includes('[book]'), true);
  assertEquals(result.includes('title = "Test Book"'), true);
  assertEquals(result.includes('language = "ja"'), true);
  assertEquals(result.includes('[build]'), true);
  assertEquals(result.includes('build-dir = "book"'), true);
});

Deno.test("generateBookToml - With authors", () => {
  const config: BookConfig = {
    title: "Test Book",
    authors: ["Author One", "Author Two"]
  };
  const result = generateBookToml(config);

  assertEquals(result.includes('authors = ["Author One", "Author Two"]'), true);
});

Deno.test("generateBookToml - With description", () => {
  const config: BookConfig = {
    title: "Test Book",
    description: "A test book"
  };
  const result = generateBookToml(config);

  assertEquals(result.includes('description = "A test book"'), true);
});

Deno.test("generateBookToml - Escapes quotes in title", () => {
  const config: BookConfig = { title: 'Test "Quoted" Book' };
  const result = generateBookToml(config);

  assertEquals(result.includes('title = "Test \\"Quoted\\" Book"'), true);
});

// =============================================================================
// getPageFilename tests
// =============================================================================

Deno.test("getPageFilename - User page", () => {
  const page: UserPage = {
    type: "user",
    turnIndex: 1,
    pageIndex: 1,
    user: {} as UserMessage,
  };
  assertEquals(getPageFilename(page), "turn_1_user.md");
});

Deno.test("getPageFilename - Text page", () => {
  const page: TextPage = {
    type: "text",
    turnIndex: 2,
    pageIndex: 3,
    assistant: {} as AssistantMessage,
  };
  assertEquals(getPageFilename(page), "turn_2_text_3.md");
});

Deno.test("getPageFilename - Tool page", () => {
  const page: ToolPage = {
    type: "tool",
    turnIndex: 3,
    pageIndex: 4,
    interactions: [],
  };
  assertEquals(getPageFilename(page), "turn_3_tool_4.md");
});

// =============================================================================
// convertTurnsToPages tests
// =============================================================================

function createUserMessage(uuid: string, content: string): UserMessage {
  return {
    type: "user",
    uuid,
    parentUuid: "",
    sessionId: "test",
    timestamp: "2025-01-01T00:00:00Z",
    cwd: "/",
    message: {
      role: "user",
      content,
    },
  };
}

function createAssistantMessage(uuid: string, contentBlocks: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }>): AssistantMessage {
  return {
    type: "assistant",
    uuid,
    parentUuid: "",
    sessionId: "test",
    timestamp: "2025-01-01T00:00:00Z",
    cwd: "/",
    message: {
      role: "assistant",
      content: contentBlocks as AssistantMessage["message"]["content"],
    },
  };
}

Deno.test("convertTurnsToPages - Simple turn with text", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Hello"),
      createAssistantMessage("asst1", [{ type: "text", text: "Hi there!" }]),
    ],
  };

  const result = convertTurnsToPages([turn]);

  assertEquals(result.length, 1);
  assertEquals(result[0].pages.length, 2);
  assertEquals(result[0].pages[0].type, "user");
  assertEquals(result[0].pages[1].type, "text");
});

Deno.test("convertTurnsToPages - Turn with tool_use", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Read a file"),
      createAssistantMessage("asst1", [
        { type: "tool_use", id: "tool1", name: "Read", input: { file_path: "/test.txt" } }
      ]),
    ],
  };

  const result = convertTurnsToPages([turn]);

  assertEquals(result.length, 1);
  assertEquals(result[0].pages.length, 2);
  assertEquals(result[0].pages[0].type, "user");
  assertEquals(result[0].pages[1].type, "tool");
});

Deno.test("convertTurnsToPages - Turn with thinking then text", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Hello"),
      createAssistantMessage("asst1", [
        { type: "thinking", thinking: "Let me think..." },
        { type: "text", text: "Hi there!" }
      ]),
    ],
  };

  const result = convertTurnsToPages([turn]);

  assertEquals(result.length, 1);
  assertEquals(result[0].pages.length, 2);
  assertEquals(result[0].pages[0].type, "user");
  assertEquals(result[0].pages[1].type, "text"); // thinking followed by text = text page
});

Deno.test("convertTurnsToPages - Multiple tool_use grouped together", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Do multiple things"),
      createAssistantMessage("asst1", [
        { type: "tool_use", id: "tool1", name: "Read", input: { file_path: "/a.txt" } }
      ]),
      createAssistantMessage("asst2", [
        { type: "tool_use", id: "tool2", name: "Read", input: { file_path: "/b.txt" } }
      ]),
      createAssistantMessage("asst3", [
        { type: "text", text: "Done!" }
      ]),
    ],
  };

  const result = convertTurnsToPages([turn]);

  assertEquals(result.length, 1);
  assertEquals(result[0].pages.length, 3); // user, tool (grouped), text
  assertEquals(result[0].pages[0].type, "user");
  assertEquals(result[0].pages[1].type, "tool");
  assertEquals(result[0].pages[2].type, "text");

  // Check that tool page has both interactions
  const toolPage = result[0].pages[1] as ToolPage;
  assertEquals(toolPage.interactions.length, 2);
});

// =============================================================================
// buildToolUseMap tests
// =============================================================================

Deno.test("buildToolUseMap - Extracts tool_use blocks", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Test"),
      createAssistantMessage("asst1", [
        { type: "tool_use", id: "tool1", name: "Read", input: { file_path: "/test.txt" } },
        { type: "tool_use", id: "tool2", name: "Write", input: { file_path: "/out.txt", content: "hello" } },
      ]),
    ],
  };

  const map = buildToolUseMap([turn]);

  assertEquals(map.size, 2);
  assertEquals(map.get("tool1")?.name, "Read");
  assertEquals(map.get("tool2")?.name, "Write");
});

Deno.test("buildToolUseMap - Empty for no tool_use", () => {
  const turn: ConversationTurn = {
    index: 1,
    messages: [
      createUserMessage("user1", "Hello"),
      createAssistantMessage("asst1", [{ type: "text", text: "Hi!" }]),
    ],
  };

  const map = buildToolUseMap([turn]);

  assertEquals(map.size, 0);
});
