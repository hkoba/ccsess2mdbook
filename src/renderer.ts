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
  TurnMessage,
  Page,
  UserPage,
  TextPage,
  ToolPage,
  ToolInteraction,
  TurnPages,
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
 * Generate SUMMARY.md content with nested structure
 */
export function generateSummary(turnPages: TurnPages[], title: string): string {
  const lines = [`# ${title}`, ""];

  for (const turn of turnPages) {
    // Turn title as parent chapter
    lines.push(`- [${turn.title}]()`);

    // Pages as sub-chapters
    for (const page of turn.pages) {
      const filename = getPageFilename(page);
      const pageTitle = getPageTitle(page);
      lines.push(`  - [${pageTitle}](./${filename})`);
    }
  }

  return lines.join("\n");
}

/**
 * Get filename for a page
 */
export function getPageFilename(page: Page): string {
  switch (page.type) {
    case "user":
      return `turn_${page.turnIndex}_user.md`;
    case "text":
      return `turn_${page.turnIndex}_text_${page.pageIndex}.md`;
    case "tool":
      return `turn_${page.turnIndex}_tool_${page.pageIndex}.md`;
  }
}

/**
 * Get display title for a page
 */
function getPageTitle(page: Page): string {
  switch (page.type) {
    case "user":
      return "User";
    case "text":
      return `Assistant (Text ${page.pageIndex})`;
    case "tool":
      return `Assistant (Tools ${page.pageIndex})`;
  }
}

/**
 * Check if assistant message starts with text content
 */
function assistantStartsWithText(assistant: AssistantMessage): boolean {
  const content = assistant.message.content;
  if (content.length === 0) return false;

  // Find first non-thinking block
  for (const block of content) {
    if (block.type === "thinking") continue;
    return block.type === "text";
  }
  return false;
}

/**
 * Convert conversation turns into page-based structure
 */
export function convertTurnsToPages(turns: ConversationTurn[]): TurnPages[] {
  const result: TurnPages[] = [];

  for (const turn of turns) {
    const pages: Page[] = [];
    let pageIndex = 1;

    // Current tool page being built (null if not in tool mode)
    let currentToolPage: ToolPage | null = null;
    // Current tool interaction being built
    let currentInteraction: ToolInteraction | null = null;

    const flushToolPage = () => {
      if (currentInteraction && currentToolPage) {
        currentToolPage.interactions.push(currentInteraction);
        currentInteraction = null;
      }
      if (currentToolPage && currentToolPage.interactions.length > 0) {
        pages.push(currentToolPage);
        currentToolPage = null;
      }
    };

    for (const msg of turn.messages) {
      if (msg.type === "user") {
        const userText = extractUserText(msg);

        if (userText.trim().length > 0) {
          // User message with text - create a user page
          flushToolPage();

          const userPage: UserPage = {
            type: "user",
            turnIndex: turn.index,
            pageIndex: pageIndex++,
            user: msg,
          };
          pages.push(userPage);
        } else {
          // User message with only tool_result - add to current interaction
          const toolResults = extractToolResults(msg);
          if (currentInteraction) {
            currentInteraction.toolResults.push(...toolResults);
          }
        }
      } else if (msg.type === "assistant") {
        if (assistantStartsWithText(msg)) {
          // Assistant starts with text - create a text page
          flushToolPage();

          const textPage: TextPage = {
            type: "text",
            turnIndex: turn.index,
            pageIndex: pageIndex++,
            assistant: msg,
          };
          pages.push(textPage);
        } else {
          // Assistant starts with tool_use - add to tool page
          // First, flush any previous interaction
          if (currentInteraction && currentToolPage) {
            currentToolPage.interactions.push(currentInteraction);
          }

          // Create new tool page if needed
          if (!currentToolPage) {
            currentToolPage = {
              type: "tool",
              turnIndex: turn.index,
              pageIndex: pageIndex++,
              interactions: [],
            };
          }

          // Start new interaction
          currentInteraction = {
            toolUse: msg,
            toolResults: [],
          };
        }
      }
    }

    // Flush any remaining tool page
    flushToolPage();

    const turnTitle = getTurnTitle(turn);
    result.push({
      turnIndex: turn.index,
      title: turnTitle,
      pages,
    });
  }

  return result;
}

/**
 * Extract tool_result blocks from user message
 */
function extractToolResults(user: UserMessage): ToolResultBlock[] {
  const content = user.message.content;
  if (typeof content === "string") {
    return [];
  }

  const results: ToolResultBlock[] = [];
  for (const block of content) {
    if (block.type === "tool_result") {
      results.push(block);
    }
  }
  return results;
}

/**
 * Get title for a turn based on first user text
 */
function getTurnTitle(turn: ConversationTurn): string {
  const userContent = extractFirstUserText(turn.messages);
  const title = userContent
    .replace(/\n/g, " ")
    .replace(/[#\[\]`*_]/g, "")
    .trim()
    .slice(0, 50);
  return title || `Turn ${turn.index}`;
}

/**
 * Extract text from the first user message that contains text
 */
function extractFirstUserText(messages: TurnMessage[]): string {
  for (const msg of messages) {
    if (msg.type === "user") {
      const text = extractUserText(msg);
      if (text.trim().length > 0) {
        return text;
      }
    }
  }
  return "";
}

/**
 * Extract text from user message content
 */
function extractUserText(user: UserMessage): string {
  const content = user.message.content;

  if (typeof content === "string") {
    return content;
  }

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
    for (const msg of turn.messages) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            map.set(block.id, block);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Render a user page to Markdown
 */
export function renderUserPage(
  page: UserPage,
  turnTitle: string,
  _options: RenderOptions
): string {
  const lines: string[] = [];

  lines.push(`# ${turnTitle}`);
  lines.push("");
  lines.push("## User");
  lines.push("");

  const content = page.user.message.content;
  if (typeof content === "string") {
    lines.push(content);
  } else {
    for (const block of content) {
      if (block.type === "text") {
        lines.push(block.text);
      }
    }
  }

  // Add uuid footer
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`<small style="color: gray">uuid: ${page.user.uuid}</small>`);

  return lines.join("\n");
}

/**
 * Render a text page (assistant message starting with text) to Markdown
 */
export function renderTextPage(
  page: TextPage,
  turnTitle: string,
  options: RenderOptions
): string {
  const lines: string[] = [];

  lines.push(`# ${turnTitle}`);
  lines.push("");
  lines.push("## Assistant");
  lines.push("");

  // Render assistant message content
  lines.push(renderAssistantMessage(page.assistant, options));

  // Add uuid footer
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`<small style="color: gray">uuid: ${page.assistant.uuid}</small>`);

  return lines.join("\n");
}

/**
 * Render a tool page (grouped tool_use and tool_result) to Markdown
 */
export function renderToolPage(
  page: ToolPage,
  turnTitle: string,
  options: RenderOptions,
  toolUseMap: ToolUseMap
): string {
  const lines: string[] = [];

  lines.push(`# ${turnTitle}`);
  lines.push("");
  lines.push("## Tool Interactions");
  lines.push("");

  const uuids: string[] = [];

  for (const interaction of page.interactions) {
    // Render the tool_use from assistant message
    lines.push(renderAssistantMessage(interaction.toolUse, options));
    lines.push("");
    uuids.push(`assistant: ${interaction.toolUse.uuid}`);

    // Render the tool results
    if (interaction.toolResults.length > 0) {
      lines.push("### Results");
      lines.push("");

      for (const result of interaction.toolResults) {
        const rendered = renderToolResult(result, toolUseMap, options);
        if (rendered) {
          lines.push(rendered);
          lines.push("");
        }
      }
    }
  }

  // Add uuid footer
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`<small style="color: gray">uuid: ${uuids.join(", ")}</small>`);

  return lines.join("\n");
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
 * Get language identifier from file extension
 */
function getLanguageFromExtension(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    // Web
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    // Programming
    py: "python",
    rb: "ruby",
    pl: "perl",
    pm: "perl",
    php: "php",
    java: "java",
    kt: "kotlin",
    scala: "scala",
    go: "go",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    m: "objectivec",
    // Shell/Config
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    fish: "fish",
    ps1: "powershell",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    xml: "xml",
    // Documentation
    md: "markdown",
    markdown: "markdown",
    rst: "rst",
    tex: "latex",
    // Data
    sql: "sql",
    graphql: "graphql",
    // Other
    dockerfile: "dockerfile",
    makefile: "makefile",
    vim: "vim",
    lua: "lua",
    r: "r",
    jl: "julia",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    clj: "clojure",
    lisp: "lisp",
    el: "elisp",
  };
  return langMap[ext] || ext;
}

/**
 * Determine the number of backquotes needed for fenced code block
 * Returns at least 3, or more if content contains that many consecutive backquotes
 * For markdown files, returns at least 4 for nesting support
 */
function getBackquoteCount(content: string, isMarkdown: boolean): number {
  const minCount = isMarkdown ? 4 : 3;

  // Find the longest sequence of backquotes in content
  const matches = content.match(/`+/g);
  if (!matches) return minCount;

  const maxInContent = Math.max(...matches.map(m => m.length));
  return Math.max(minCount, maxInContent + 1);
}

/**
 * Render tool_use block
 */
function renderToolUse(block: ToolUseBlock, collapse: boolean): string {
  let content: string;

  if (block.name === "Write") {
    // Special handling for Write tool
    content = renderWriteToolUse(block);
  } else {
    const inputJson = JSON.stringify(block.input, null, 2);
    content = `**Tool: ${block.name}**

\`\`\`json
${inputJson}
\`\`\``;
  }

  if (collapse) {
    return `<details>
<summary>Tool: ${block.name}</summary>

${content}

</details>`;
  }

  return content;
}

/**
 * Render Write tool_use block with proper code fencing
 */
function renderWriteToolUse(block: ToolUseBlock): string {
  const filePath = block.input.file_path as string || "";
  const fileContent = block.input.content as string || "";

  const lang = getLanguageFromExtension(filePath);
  const isMarkdown = lang === "markdown";
  const backquoteCount = getBackquoteCount(fileContent, isMarkdown);
  const fence = "`".repeat(backquoteCount);

  return `**Tool: Write** \`${filePath}\`

${fence}${lang}
${fileContent}
${fence}`;
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
    return `*Read: \`${filePath}\` (contents omitted)*`;
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
