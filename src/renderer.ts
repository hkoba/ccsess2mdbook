import type {
  BookConfig,
  ContentBlock,
  ConversationTurn,
  RenderOptions,
  ToolResultBlock,
  ToolUseBlock,
  ToolUseMap,
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

  // Array of content blocks - find text
  for (const block of content) {
    if (block.type === "text") {
      return block.text;
    }
  }

  return "";
}

/**
 * Build a map of tool_use id -> ToolUseBlock from all conversation turns
 */
export function buildToolUseMap(turns: ConversationTurn[]): ToolUseMap {
  const map: ToolUseMap = new Map();

  for (const turn of turns) {
    for (const assistant of turn.assistants) {
      for (const block of assistant.message.content) {
        if (block.type === "tool_use") {
          map.set(block.id, block);
        }
      }
    }
  }

  return map;
}

/**
 * Render a conversation turn to Markdown (flat structure)
 */
export function renderTurnToMarkdown(
  turn: ConversationTurn,
  options: RenderOptions,
  toolUseMap: ToolUseMap
): string {
  const lines: string[] = [];
  const title = getChapterTitle(turn);

  lines.push(`# ${title}`);
  lines.push("");

  // Render user message
  lines.push("## User");
  lines.push("");
  lines.push(renderUserMessage(turn.user, toolUseMap, options));
  lines.push("");

  // Render assistant messages
  lines.push("## Assistant");
  lines.push("");

  for (const assistant of turn.assistants) {
    lines.push(renderAssistantMessage(assistant, options));
  }

  // Add uuid reference at the end
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(renderUuidFooter(turn));

  return lines.join("\n");
}

/**
 * Render uuid footer for reference
 */
function renderUuidFooter(turn: ConversationTurn): string {
  const uuids: string[] = [];
  uuids.push(`user: ${turn.user.uuid}`);
  for (const assistant of turn.assistants) {
    uuids.push(`assistant: ${assistant.uuid}`);
  }
  return `<small style="color: gray">uuid: ${uuids.join(", ")}</small>`;
}

/**
 * Render user message to Markdown
 */
function renderUserMessage(
  user: UserMessage,
  toolUseMap: ToolUseMap,
  options: RenderOptions
): string {
  const content = user.message.content;

  if (typeof content === "string") {
    return content;
  }

  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "tool_result") {
      const rendered = renderToolResult(block, toolUseMap, options);
      if (rendered) {
        parts.push(rendered);
      }
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
      // tool_result in assistant message (shouldn't happen normally)
      if (options.hideToolResults) {
        return null;
      }
      return renderToolResultGeneric(block, options.collapseTools);

    default:
      return null;
  }
}

/**
 * Render thinking block as blockquote
 */
function renderThinking(thinking: string): string {
  const lines = thinking.split("\n");
  const quoted = lines.map((line) => `> ${line}`).join("\n");
  return quoted;
}

/**
 * Render tool_use block
 */
function renderToolUse(block: ToolUseBlock, collapse: boolean): string {
  const inputJson = JSON.stringify(block.input, null, 2);

  const content = `\n**Tool: ${block.name}**

\`\`\`json
${inputJson}
\`\`\``;

  if (collapse) {
    return `
<details>
<summary>Tool: ${block.name}</summary>

${content}

</details>`;
  }

  return content;
}

/**
 * Render tool_result block with context from tool_use map
 */
function renderToolResult(
  block: ToolResultBlock,
  toolUseMap: ToolUseMap,
  options: RenderOptions
): string | null {
  // Find the corresponding tool_use
  const toolUse = toolUseMap.get(block.tool_use_id);
  const toolName = toolUse?.name || "Unknown";

  // Show abbreviated Read results by default
  if (options.hideReadResults && toolName === "Read") {
    const filePath = toolUse?.input?.file_path as string || "(unknown file)";
    return `\n*Read: \`${filePath}\` (contents omitted)*`;
  }

  // Hide all tool results if option is set
  if (options.hideToolResults) {
    return null;
  }

  // For Task tool, render content as markdown directly
  if (toolName === "Task") {
    return renderTaskResult(block);
  }

  // For other tools, use generic rendering
  return renderToolResultGeneric(block, options.collapseTools);
}

/**
 * Render Task tool result as markdown
 */
function renderTaskResult(block: ToolResultBlock): string {
  let resultText: string;

  if (typeof block.content === "string") {
    resultText = block.content;
  } else if (Array.isArray(block.content)) {
    resultText = block.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n\n");
  } else {
    resultText = JSON.stringify(block.content, null, 2);
  }

  const errorPrefix = block.is_error ? "**Error:**\n\n" : "";
  return errorPrefix + resultText;
}

/**
 * Render tool_result block generically (for non-Task tools)
 */
function renderToolResultGeneric(block: ToolResultBlock, collapse: boolean): string {
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
  const content = `\n**Result${errorPrefix}:**

\`\`\`
${displayText}
\`\`\``;

  if (collapse) {
    return `
<details>
<summary>Tool Result${errorPrefix}</summary>

${content}

</details>`;
  }

  return content;
}
