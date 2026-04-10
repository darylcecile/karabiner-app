import { describe, expect, it } from "bun:test";
import {
  isWithinPathBoundary,
  matchesNetworkAllowlist,
  normalizeFileExtension,
  resolvePreviewContentType,
} from "./host-utils";

describe("runtime host utils", () => {
  it("normalizes and validates file extensions", () => {
    expect(normalizeFileExtension(".tldraw")).toBe(".tldraw");
    expect(() => normalizeFileExtension("tldraw")).toThrow();
    expect(() => normalizeFileExtension("../a")).toThrow();
  });

  it("resolves preview content types", () => {
    expect(resolvePreviewContentType(undefined)).toBe("text");
    expect(resolvePreviewContentType("markdown")).toBe("markdown");
    expect(resolvePreviewContentType("json")).toBe("json");
    expect(() => resolvePreviewContentType("xml")).toThrow();
  });

  it("matches allowlist host and wildcard entries", () => {
    expect(matchesNetworkAllowlist("api.example.com:443", "api.example.com", 443)).toBe(true);
    expect(matchesNetworkAllowlist("*.example.com", "cdn.example.com", 443)).toBe(true);
    expect(matchesNetworkAllowlist("api.example.com:443", "api.example.com", 80)).toBe(false);
  });

  it("checks safe path boundary inclusion", () => {
    expect(isWithinPathBoundary("/workspace/notes/a.md", "/workspace/notes")).toBe(true);
    expect(isWithinPathBoundary("/workspace/other/a.md", "/workspace/notes")).toBe(false);
  });
});
