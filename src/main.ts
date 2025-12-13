import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs/ensure-dir";
import { join, basename } from "@std/path";

import { loadSessionFile } from "./parser.ts";
import { extractConversationTurns, getSessionMetadata } from "./converter.ts";
import {
  buildToolUseMap,
  generateBookToml,
  generateSummary,
  renderTurnToMarkdown,
} from "./renderer.ts";
import type { BookConfig, RenderOptions } from "./types.ts";

interface CliOptions {
  output: string;
  title: string;
  hideThinking: boolean;
  hideToolResults: boolean;
  hideReadResults: boolean;
  collapseTools: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
ccsess2mdbook - Convert Claude Code session files to mdbook format

USAGE:
  deno run -A src/main.ts <input.jsonl> [OPTIONS]

ARGUMENTS:
  <input.jsonl>    Path to Claude Code session file (.jsonl)

OPTIONS:
  -o, --output <dir>       Output directory (default: ./book)
  -t, --title <title>      Book title (default: extracted from filename)
  --hide-thinking          Hide thinking blocks
  --hide-tool-results      Hide tool result blocks
  --show-read-results      Show Read tool results (hidden by default)
  --collapse-tools         Collapse tool blocks in <details> tags
  -h, --help               Show this help message

EXAMPLE:
  deno run -A src/main.ts session.jsonl -o ./my-book --title "My Session"
`);
}

function parseCliArgs(args: string[]): { inputFile: string; options: CliOptions } | null {
  const parsed = parseArgs(args, {
    string: ["output", "o", "title", "t"],
    boolean: ["hide-thinking", "hide-tool-results", "show-read-results", "collapse-tools", "help", "h"],
    alias: {
      o: "output",
      t: "title",
      h: "help",
    },
    default: {
      output: "./book",
      title: "",
      "hide-thinking": false,
      "hide-tool-results": false,
      "show-read-results": false,
      "collapse-tools": false,
    },
  });

  if (parsed.help || parsed.h) {
    return null;
  }

  const inputFile = parsed._[0] as string;
  if (!inputFile) {
    console.error("Error: Input file is required");
    return null;
  }

  return {
    inputFile,
    options: {
      output: (parsed.output || parsed.o || "./book") as string,
      title: (parsed.title || parsed.t || "") as string,
      hideThinking: parsed["hide-thinking"] as boolean,
      hideToolResults: parsed["hide-tool-results"] as boolean,
      hideReadResults: !parsed["show-read-results"] as boolean,
      collapseTools: parsed["collapse-tools"] as boolean,
      help: false,
    },
  };
}

async function main(): Promise<void> {
  const result = parseCliArgs(Deno.args);

  if (!result) {
    printHelp();
    Deno.exit(result === null ? 0 : 1);
  }

  const { inputFile, options } = result;

  // Check input file exists
  try {
    await Deno.stat(inputFile);
  } catch {
    console.error(`Error: Input file not found: ${inputFile}`);
    Deno.exit(1);
  }

  console.log(`Loading session file: ${inputFile}`);

  // Load and parse session file
  const entries = await loadSessionFile(inputFile);
  console.log(`Loaded ${entries.length} entries`);

  // Extract conversation turns
  const turns = extractConversationTurns(entries);
  console.log(`Extracted ${turns.length} conversation turns`);

  if (turns.length === 0) {
    console.error("Error: No conversation turns found in session file");
    Deno.exit(1);
  }

  // Get session metadata
  const metadata = getSessionMetadata(entries);

  // Determine title
  const title = options.title ||
    metadata.sessionId?.slice(0, 8) ||
    basename(inputFile, ".jsonl");

  // Create output directory structure
  const outputDir = options.output;
  const srcDir = join(outputDir, "src");
  await ensureDir(srcDir);

  // Generate book.toml
  const bookConfig: BookConfig = {
    title,
    language: "ja",
  };
  const bookToml = generateBookToml(bookConfig);
  await Deno.writeTextFile(join(outputDir, "book.toml"), bookToml);
  console.log(`Created: ${join(outputDir, "book.toml")}`);

  // Generate SUMMARY.md
  const summary = generateSummary(turns, title);
  await Deno.writeTextFile(join(srcDir, "SUMMARY.md"), summary);
  console.log(`Created: ${join(srcDir, "SUMMARY.md")}`);

  // Generate chapter files
  const renderOptions: RenderOptions = {
    hideThinking: options.hideThinking,
    hideToolResults: options.hideToolResults,
    hideReadResults: options.hideReadResults,
    collapseTools: options.collapseTools,
  };

  // Build tool use map from all turns for cross-turn reference
  const toolUseMap = buildToolUseMap(turns);

  for (const turn of turns) {
    const markdown = renderTurnToMarkdown(turn, renderOptions, toolUseMap);
    const filename = `chapter_${turn.index}.md`;
    await Deno.writeTextFile(join(srcDir, filename), markdown);
  }
  console.log(`Created ${turns.length} chapter files`);

  console.log(`\nDone! mdbook project created at: ${outputDir}`);
  console.log(`\nTo build the book, run:`);
  console.log(`  cd ${outputDir} && mdbook build`);
  console.log(`\nTo serve the book locally:`);
  console.log(`  cd ${outputDir} && mdbook serve`);
}

// Run main
main().catch((err) => {
  console.error("Error:", err.message);
  Deno.exit(1);
});
