import { describe, expect, it } from "bun:test";
import {
  assertReadableTextFile,
  deriveWorkspaceItemTitle,
  getWorkspaceItemKind,
} from "./storage-utils";

describe("storage utils", () => {
  it("classifies workspace item kinds from file paths", () => {
    expect(getWorkspaceItemKind("notes/daily.md")).toBe("note");
    expect(getWorkspaceItemKind("assets/logo.PNG")).toBe("image");
    expect(getWorkspaceItemKind("config/app.toml")).toBe("file");
  });

  it("derives titles from file paths", () => {
    expect(deriveWorkspaceItemTitle("docs/project.plan.md")).toBe("project.plan");
    expect(deriveWorkspaceItemTitle("scripts/run")).toBe("run");
  });

  it("guards text editor fallback against binary and oversized files", () => {
    expect(() => assertReadableTextFile(Buffer.from("hello"), 1024)).not.toThrow();
    expect(() => assertReadableTextFile(Buffer.from([0x01, 0x00, 0x02]), 1024)).toThrow(
      "This file appears to be binary and cannot be opened in the text editor.",
    );
    expect(() => assertReadableTextFile(Buffer.alloc(6), 5)).toThrow(
      "Text file exceeds 5 bytes and cannot be opened in the editor.",
    );
  });
});
