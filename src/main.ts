import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs/ensure-dir";
import { join, basename } from "@std/path";

import { loadSessionFile } from "./parser.ts";
import { extractConversationTurns, getSessionMetadata } from "./converter.ts";
import {
  buildToolUseMap,
  convertTurnsToPages,
  generateBookToml,
  generateSummary,
  getPageFilename,
  renderUserPage,
  renderTextPage,
  renderToolPage,
} from "./renderer.ts";
import type { BookConfig, RenderOptions, SessionEntry } from "./types.ts";

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
  deno run -A src/main.ts <input.jsonl>... [OPTIONS]

ARGUMENTS:
  <input.jsonl>...   Path(s) to Claude Code session file(s) (.jsonl)
                     Multiple files will be merged in chronological order

OPTIONS:
  -o, --output <dir>       Output directory (default: ./book)
  -t, --title <title>      Book title (default: extracted from filename)
  --hide-thinking          Hide thinking blocks
  --hide-tool-results      Hide tool result blocks
  --show-read-results      Show Read tool results (hidden by default)
  --collapse-tools         Collapse tool blocks in <details> tags
  -h, --help               Show this help message

EXAMPLES:
  # Single session
  deno run -A src/main.ts session.jsonl -o ./my-book --title "My Session"

  # Multiple sessions (compaction continued)
  deno run -A src/main.ts session1.jsonl session2.jsonl -o ./merged-book
`);
}

function parseCliArgs(args: string[]): { inputFiles: string[]; options: CliOptions } | null {
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

  const inputFiles = parsed._.map(f => String(f));
  if (inputFiles.length === 0) {
    console.error("Error: At least one input file is required");
    return null;
  }

  return {
    inputFiles,
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

/**
 * Load and merge multiple session files
 * Files are sorted by their first timestamp, then entries are merged
 */
async function loadAndMergeSessionFiles(files: string[]): Promise<SessionEntry[]> {
  // Load all files with their metadata
  const loadedSessions: { file: string; entries: SessionEntry[]; firstTimestamp: string | null }[] = [];

  for (const file of files) {
    const entries = await loadSessionFile(file);
    const firstTimestamp = getFirstTimestamp(entries);
    loadedSessions.push({ file, entries, firstTimestamp });
    console.log(`  Loaded ${file}: ${entries.length} entries`);
  }

  // Sort sessions by first timestamp
  loadedSessions.sort((a, b) => {
    if (!a.firstTimestamp) return -1;
    if (!b.firstTimestamp) return 1;
    return a.firstTimestamp.localeCompare(b.firstTimestamp);
  });

  // Merge entries, tracking seen UUIDs to avoid duplicates
  const seenUuids = new Set<string>();
  const merged: SessionEntry[] = [];

  for (const session of loadedSessions) {
    for (const entry of session.entries) {
      // Skip summary entries (compaction markers)
      if (entry.type === "summary") {
        continue;
      }

      // Skip duplicates based on uuid
      const uuid = getEntryUuid(entry);
      if (uuid && seenUuids.has(uuid)) {
        continue;
      }
      if (uuid) {
        seenUuids.add(uuid);
      }

      merged.push(entry);
    }
  }

  return merged;
}

/**
 * Get first timestamp from session entries
 */
function getFirstTimestamp(entries: SessionEntry[]): string | null {
  for (const entry of entries) {
    if ((entry.type === "user" || entry.type === "assistant") && entry.timestamp) {
      return entry.timestamp;
    }
  }
  return null;
}

/**
 * Get UUID from an entry
 */
function getEntryUuid(entry: SessionEntry): string | null {
  if (entry.type === "user" || entry.type === "assistant") {
    return entry.uuid;
  }
  if (entry.type === "file-history-snapshot") {
    return entry.messageId;
  }
  return null;
}

async function main(): Promise<void> {
  const result = parseCliArgs(Deno.args);

  if (!result) {
    printHelp();
    Deno.exit(result === null ? 0 : 1);
  }

  const { inputFiles, options } = result;

  // Check all input files exist
  for (const inputFile of inputFiles) {
    try {
      await Deno.stat(inputFile);
    } catch {
      console.error(`Error: Input file not found: ${inputFile}`);
      Deno.exit(1);
    }
  }

  console.log(`Loading ${inputFiles.length} session file(s)...`);

  // Load and merge session files
  const entries = await loadAndMergeSessionFiles(inputFiles);
  console.log(`Total: ${entries.length} entries after merging`);

  // Extract conversation turns
  const turns = extractConversationTurns(entries);
  console.log(`Extracted ${turns.length} conversation turns`);

  if (turns.length === 0) {
    console.error("Error: No conversation turns found in session file(s)");
    Deno.exit(1);
  }

  // Convert turns to pages
  const turnPages = convertTurnsToPages(turns);
  const totalPages = turnPages.reduce((sum, tp) => sum + tp.pages.length, 0);
  console.log(`Generated ${totalPages} pages`);

  // Get session metadata
  const metadata = getSessionMetadata(entries);

  // Determine title
  const title = options.title ||
    metadata.sessionId?.slice(0, 8) ||
    basename(inputFiles[0], ".jsonl");

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
  const summary = generateSummary(turnPages, title);
  await Deno.writeTextFile(join(srcDir, "SUMMARY.md"), summary);
  console.log(`Created: ${join(srcDir, "SUMMARY.md")}`);

  // Generate page files
  const renderOptions: RenderOptions = {
    hideThinking: options.hideThinking,
    hideToolResults: options.hideToolResults,
    hideReadResults: options.hideReadResults,
    collapseTools: options.collapseTools,
  };

  // Build tool use map from all turns for cross-turn reference
  const toolUseMap = buildToolUseMap(turns);

  for (const turnPage of turnPages) {
    for (const page of turnPage.pages) {
      let markdown: string;

      switch (page.type) {
        case "user":
          markdown = renderUserPage(page, turnPage.title, renderOptions);
          break;
        case "text":
          markdown = renderTextPage(page, turnPage.title, renderOptions);
          break;
        case "tool":
          markdown = renderToolPage(page, turnPage.title, renderOptions, toolUseMap);
          break;
      }

      const filename = getPageFilename(page);
      await Deno.writeTextFile(join(srcDir, filename), markdown);
    }
  }
  console.log(`Created ${totalPages} page files`);

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
