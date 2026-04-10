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
      schema?: { schemaVersion?: number; sequences?: Record<string, number> };
      records?: unknown[];
    };
    expect(parsed.tldrawFileFormatVersion).toBe(1);
    expect(parsed.schema?.schemaVersion).toBe(2);
    expect(Object.keys(parsed.schema?.sequences ?? {}).length).toBeGreaterThan(0);
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

  it("replaces legacy invalid empty tldraw scaffold", () => {
    const legacy = JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: {
        schemaVersion: 2,
        sequences: {},
      },
      records: [],
    });
    const result = ensureNonEmptyTldrawDocument(legacy);
    expect(result.shouldWrite).toBe(true);
    const parsed = JSON.parse(result.content) as {
      schema: { sequences?: Record<string, number> };
    };
    expect(Object.keys(parsed.schema.sequences ?? {}).length).toBeGreaterThan(0);
  });
});
