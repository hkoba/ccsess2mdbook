import type { SessionEntry } from "./types.ts";

/**
 * Parse a JSONL session file and yield each entry
 */
export async function* parseSessionFile(
  path: string
): AsyncGenerator<SessionEntry> {
  const file = await Deno.open(path, { read: true });
  const decoder = new TextDecoder();
  const reader = file.readable.getReader();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          yield JSON.parse(buffer.trim()) as SessionEntry;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          yield JSON.parse(trimmed) as SessionEntry;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Load all session entries into an array
 */
export async function loadSessionFile(path: string): Promise<SessionEntry[]> {
  const entries: SessionEntry[] = [];
  for await (const entry of parseSessionFile(path)) {
    entries.push(entry);
  }
  return entries;
}
