import { describe, expect, it } from "bun:test";
import { ExtensionPermissionGate } from "./permissions";

describe("ExtensionPermissionGate", () => {
  it("enforces required permissions", () => {
    const gate = new ExtensionPermissionGate([]);
    expect(() => gate.require("filesystem.read", "test.read")).toThrow(
      'Permission "filesystem.read" is required',
    );
  });

  it("returns configured scopes by permission type", () => {
    const gate = new ExtensionPermissionGate([
      {
        id: "filesystem.read",
        reason: "Read docs",
        roots: ["$workspace"],
      },
      {
        id: "network",
        reason: "Fetch metadata",
        allowlist: ["api.example.com:443"],
      },
      {
        id: "cli.exec",
        reason: "Run formatter",
        commands: ["prettier"],
      },
      {
        id: "ai.provider",
        reason: "Use AI",
        providerIds: ["openai"],
      },
    ]);

    expect(gate.getFilesystemRoots("read")).toEqual(["$workspace"]);
    expect(gate.getFilesystemRoots("write")).toEqual([]);
    expect(gate.getNetworkAllowlist()).toEqual(["api.example.com:443"]);
    expect(gate.getAllowedCliCommands()).toEqual(["prettier"]);
    expect(gate.getAllowedAIProviderIds()).toEqual(["openai"]);
  });
});
