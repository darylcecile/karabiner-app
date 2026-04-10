import { describe, expect, it } from "bun:test";
import {
  createInitialTldrawDocument,
  ensureNonEmptyTldrawDocument,
} from "./document";

describe("draw document helpers", () => {
  it("creates a valid default tldraw payload", () => {
    const content = createInitialTldrawDocument();
    const parsed = JSON.parse(content) as {
      tldrawFileFormatVersion: number;
      schema?: { schemaVersion?: number };
      records?: unknown[];
    };
    expect(parsed.tldrawFileFormatVersion).toBe(1);
    expect(parsed.schema?.schemaVersion).toBe(2);
    expect(Array.isArray(parsed.records)).toBe(true);
  });

  it("returns original content for non-empty files", () => {
    const raw = '{"ok":true}';
    const result = ensureNonEmptyTldrawDocument(raw);
    expect(result.content).toBe(raw);
    expect(result.shouldWrite).toBe(false);
  });

  it("replaces empty file content with default structure", () => {
    const result = ensureNonEmptyTldrawDocument("   \n");
    expect(result.shouldWrite).toBe(true);
    const parsed = JSON.parse(result.content) as { tldrawFileFormatVersion: number };
    expect(parsed.tldrawFileFormatVersion).toBe(1);
  });
});
