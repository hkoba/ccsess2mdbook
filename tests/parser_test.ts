import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { loadSessionFile, parseSessionFile } from "../src/parser.ts";

// =============================================================================
// Helper functions
// =============================================================================

async function withTempFile(
  content: string,
  fn: (path: string) => Promise<void>
): Promise<void> {
  const tempDir = await Deno.makeTempDir();
  const tempFile = `${tempDir}/test.jsonl`;
  await Deno.writeTextFile(tempFile, content);

  try {
    await fn(tempFile);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

// =============================================================================
// parseSessionFile tests
// =============================================================================

Deno.test("parseSessionFile - Single line", async () => {
  const content = '{"type":"user","uuid":"test1","message":{"role":"user","content":"Hello"}}';

  await withTempFile(content, async (path) => {
    const entries = [];
    for await (const entry of parseSessionFile(path)) {
      entries.push(entry);
    }

    assertEquals(entries.length, 1);
    assertEquals(entries[0].type, "user");
  });
});

Deno.test("parseSessionFile - Multiple lines", async () => {
  const content = `{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}
{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[]}}
{"type":"user","uuid":"u2","message":{"role":"user","content":"World"}}`;

  await withTempFile(content, async (path) => {
    const entries = [];
    for await (const entry of parseSessionFile(path)) {
      entries.push(entry);
    }

    assertEquals(entries.length, 3);
    assertEquals(entries[0].type, "user");
    assertEquals(entries[1].type, "assistant");
    assertEquals(entries[2].type, "user");
  });
});

Deno.test("parseSessionFile - Empty lines ignored", async () => {
  const content = `{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}

{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[]}}`;

  await withTempFile(content, async (path) => {
    const entries = [];
    for await (const entry of parseSessionFile(path)) {
      entries.push(entry);
    }

    assertEquals(entries.length, 2);
  });
});

Deno.test("parseSessionFile - Whitespace only lines ignored", async () => {
  const content = `{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}

{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[]}}`;

  await withTempFile(content, async (path) => {
    const entries = [];
    for await (const entry of parseSessionFile(path)) {
      entries.push(entry);
    }

    assertEquals(entries.length, 2);
  });
});

Deno.test("parseSessionFile - Empty file", async () => {
  const content = "";

  await withTempFile(content, async (path) => {
    const entries = [];
    for await (const entry of parseSessionFile(path)) {
      entries.push(entry);
    }

    assertEquals(entries.length, 0);
  });
});

// =============================================================================
// loadSessionFile tests
// =============================================================================

Deno.test("loadSessionFile - Returns array of entries", async () => {
  const content = `{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}
{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[]}}`;

  await withTempFile(content, async (path) => {
    const entries = await loadSessionFile(path);

    assertEquals(entries.length, 2);
    assertEquals(entries[0].type, "user");
    assertEquals(entries[1].type, "assistant");
  });
});

Deno.test("loadSessionFile - Handles summary entries", async () => {
  const content = `{"type":"summary","summary":"Test","leafUuid":"uuid1"}
{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}`;

  await withTempFile(content, async (path) => {
    const entries = await loadSessionFile(path);

    assertEquals(entries.length, 2);
    assertEquals(entries[0].type, "summary");
    assertEquals(entries[1].type, "user");
  });
});

Deno.test("loadSessionFile - Handles file-history-snapshot", async () => {
  const content = `{"type":"file-history-snapshot","messageId":"m1","snapshot":{}}
{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}`;

  await withTempFile(content, async (path) => {
    const entries = await loadSessionFile(path);

    assertEquals(entries.length, 2);
    assertEquals(entries[0].type, "file-history-snapshot");
    assertEquals(entries[1].type, "user");
  });
});

Deno.test("loadSessionFile - Complex content with tool_use", async () => {
  const content = `{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/test.txt"}}]}}`;

  await withTempFile(content, async (path) => {
    const entries = await loadSessionFile(path);

    assertEquals(entries.length, 1);
    assertEquals(entries[0].type, "assistant");
    if (entries[0].type === "assistant") {
      assertEquals(entries[0].message.content[0].type, "tool_use");
    }
  });
});
