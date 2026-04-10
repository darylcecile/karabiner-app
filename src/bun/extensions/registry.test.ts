import { describe, expect, it } from "bun:test";
import { EXTENSION_MANIFEST_VERSION } from "../../shared/contracts/extensions";
import type { InstalledExtension } from "../../shared/contracts/extensions";
import { ExtensionRegistry } from "./registry";

function createInstalledExtension(id: string): InstalledExtension {
  return {
    manifest: {
      manifestVersion: EXTENSION_MANIFEST_VERSION,
      id,
      name: id,
      version: "0.0.1",
      entrypoint: "runtime/index.mjs",
      permissions: [],
    },
    installSource: {
      type: "local-path",
      path: `/tmp/${id}`,
    },
    installedAt: new Date().toISOString(),
    rootDir: `/tmp/${id}`,
  };
}

describe("ExtensionRegistry", () => {
  it("registers and removes installed extensions", () => {
    const registry = new ExtensionRegistry();
    const draw = createInstalledExtension("karabiner.draw");
    const planner = createInstalledExtension("karabiner.plan");

    registry.register(draw);
    registry.register(planner);
    expect(registry.getById(draw.manifest.id)?.manifest.name).toBe("karabiner.draw");

    registry.remove(draw.manifest.id);
    expect(registry.getById(draw.manifest.id)).toBeUndefined();
    expect(registry.list().map((entry) => entry.manifest.id)).toEqual(["karabiner.plan"]);
  });
});
