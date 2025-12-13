import type {
  BookConfig,
  ContentBlock,
  ConversationTurn,
  RenderOptions,
  ToolResultBlock,
  ToolUseBlock,
  UserMessage,
  AssistantMessage,
} from "./types.ts";

/**
 * Generate book.toml content
 */
export function generateBookToml(config: BookConfig): string {
  const lines = [
    "[book]",
    `title = "${escapeTomlString(config.title)}"`,
  ];

  if (config.authors && config.authors.length > 0) {
    const authors = config.authors.map((a) => `"${escapeTomlString(a)}"`).join(", ");
    lines.push(`authors = [${authors}]`);
  }

  if (config.description) {
    lines.push(`description = "${escapeTomlString(config.description)}"`);
  }

  lines.push(`language = "${config.language || "ja"}"`);
  lines.push("");
  lines.push("[build]");
  lines.push('build-dir = "book"');

  return lines.join("\n");
}

function escapeTomlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Generate SUMMARY.md content
 */
export function generateSummary(turns: ConversationTurn[], title: string): string {
  const lines = [`# ${title}`, ""];

  for (const turn of turns) {
    const chapterTitle = getChapterTitle(turn);
    lines.push(`- [${chapterTitle}](./chapter_${turn.index}.md)`);
  }

  return lines.join("\n");
}

/**
 * Get a title for the chapter based on user message
 */
function getChapterTitle(turn: ConversationTurn): string {
  const userContent = extractUserText(turn.user);
  // Take first 50 chars of user message, clean it up
  const title = userContent
    .replace(/\n/g, " ")
    .replace(/[#\[\]`*_]/g, "")
    .trim()
    .slice(0, 50);
  return title || `Turn ${turn.index}`;
}

/**
 * Extract text from user message content
 */
function extractUserText(user: UserMessage): string {
  const content = user.message.content;

  if (typeof content === "string") {
    return content;
  }

  // Array of content blocks - find text or tool_result with text
  for (const block of content) {
    if (block.type === "text") {
      return block.text;
    }
  }

  return "";
}

/**
 * Render a conversation turn to Markdown
 */
export function renderTurnToMarkdown(
  turn: ConversationTurn,
  options: RenderOptions
): string {
  const lines: string[] = [];
  const title = getChapterTitle(turn);

  lines.push(`# ${title}`);
  lines.push("");

  // Render user message
  lines.push("## User");
  lines.push("");
  lines.push(renderUserMessage(turn.user));
  lines.push("");

  // Render assistant messages
  lines.push("## Assistant");
  lines.push("");

  for (const assistant of turn.assistants) {
    lines.push(renderAssistantMessage(assistant, options));
  }

  return lines.join("\n");
}

/**
 * Render user message to Markdown
 */
function renderUserMessage(user: UserMessage): string {
  const content = user.message.content;

  if (typeof content === "string") {
    return content;
  }

  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "tool_result") {
      parts.push(renderToolResult(block, false));
    }
  }

  return parts.join("\n\n");
}

/**
 * Render assistant message to Markdown
 */
function renderAssistantMessage(
  assistant: AssistantMessage,
  options: RenderOptions
): string {
  const parts: string[] = [];

  for (const block of assistant.message.content) {
    const rendered = renderContentBlock(block, options);
    if (rendered) {
      parts.push(rendered);
    }
  }

  return parts.join("\n\n");
}

/**
 * Render a single content block to Markdown
 */
function renderContentBlock(
  block: ContentBlock,
  options: RenderOptions
): string | null {
  switch (block.type) {
    case "text":
      return block.text;

    case "thinking":
      if (options.hideThinking) {
        return null;
      }
      return renderThinking(block.thinking);

    case "tool_use":
      return renderToolUse(block, options.collapseTools);

    case "tool_result":
      if (options.hideToolResults) {
        return null;
      }
      return renderToolResult(block, options.collapseTools);

    default:
      return null;
  }
}

/**
 * Render thinking block as collapsible
 */
function renderThinking(thinking: string): string {
  return `<details>
<summary>Thinking...</summary>

${thinking}

</details>`;
}

/**
 * Render tool_use block
 */
function renderToolUse(block: ToolUseBlock, collapse: boolean): string {
  const inputJson = JSON.stringify(block.input, null, 2);
  const content = `**Tool: ${block.name}**

\`\`\`json
${inputJson}
\`\`\``;

  if (collapse) {
    return `<details>
<summary>Tool: ${block.name}</summary>

${content}

</details>`;
  }

  return content;
}

/**
 * Render tool_result block
 */
function renderToolResult(block: ToolResultBlock, collapse: boolean): string {
  let resultText: string;

  if (typeof block.content === "string") {
    resultText = block.content;
  } else if (Array.isArray(block.content)) {
    resultText = block.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  } else {
    resultText = JSON.stringify(block.content, null, 2);
  }

  // Truncate very long results
  const maxLength = 2000;
  const truncated = resultText.length > maxLength;
  const displayText = truncated
    ? resultText.slice(0, maxLength) + "\n... (truncated)"
    : resultText;

  const errorPrefix = block.is_error ? " (Error)" : "";
  const content = `**Result${errorPrefix}:**

\`\`\`
${displayText}
\`\`\``;

  if (collapse) {
    return `<details>
<summary>Tool Result${errorPrefix}</summary>

${content}

</details>`;
  }

  return content;
}
