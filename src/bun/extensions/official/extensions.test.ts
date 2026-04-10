import { afterEach, describe, expect, it } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTENSION_MANIFEST_VERSION } from "../../../shared/contracts/extensions";
import type { ExtensionManifest } from "../../../shared/contracts/extensions";
import {
  __officialExtensionsTestUtils,
  installPreparedOfficialExtension,
} from "./extensions";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("installPreparedOfficialExtension", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await __officialExtensionsTestUtils.clearPreparedInstalls();
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop();
      if (!path) {
        continue;
      }
      await rm(path, { recursive: true, force: true });
    }
  });

  it("rejects unknown or expired install tokens", async () => {
    const extensionsRoot = await mkdtemp(join(tmpdir(), "karabiner-ext-install-root-"));
    cleanupPaths.push(extensionsRoot);

    await expect(
      installPreparedOfficialExtension(extensionsRoot, "karabiner.draw", "missing-token"),
    ).rejects.toThrow("Install approval expired");
  });

  it("rejects install tokens for another extension id", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "karabiner-ext-install-mismatch-"));
    cleanupPaths.push(tempRoot);
    const extractedDir = join(tempRoot, "extracted");
    await mkdir(extractedDir, { recursive: true });
    await writeFile(join(extractedDir, "index.ts"), "export default function noop() {}", "utf8");

    const manifest: ExtensionManifest = {
      manifestVersion: EXTENSION_MANIFEST_VERSION,
      id: "karabiner.draw",
      name: "Draw",
      version: "0.0.1",
      entrypoint: "index.ts",
      permissions: [],
    };

    __officialExtensionsTestUtils.setPreparedInstall({
      token: "mismatch-token",
      entry: {
        id: "karabiner.draw",
        slug: "draw",
        name: "Draw",
        version: "0.0.1",
      },
      manifest,
      readme: "# Draw",
      extractedExtensionDirectory: extractedDir,
      tempDirectory: tempRoot,
      expiresAt: Date.now() + 60_000,
    });

    const extensionsRoot = await mkdtemp(join(tmpdir(), "karabiner-ext-install-root-"));
    cleanupPaths.push(extensionsRoot);
    await expect(
      installPreparedOfficialExtension(extensionsRoot, "karabiner.other", "mismatch-token"),
    ).rejects.toThrow('Install token is for "karabiner.draw"');
    expect(__officialExtensionsTestUtils.hasPreparedInstall("mismatch-token")).toBe(true);
  });

  it("writes extension runtime files and clears prepared install state", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "karabiner-ext-install-success-"));
    cleanupPaths.push(tempRoot);
    const extractedDir = join(tempRoot, "extracted");
    await mkdir(extractedDir, { recursive: true });
    await writeFile(
      join(extractedDir, "index.ts"),
      "export function activate() { return { ok: true }; }",
      "utf8",
    );

    const manifest: ExtensionManifest = {
      manifestVersion: EXTENSION_MANIFEST_VERSION,
      id: "karabiner.draw",
      name: "Draw",
      version: "0.0.1",
      entrypoint: "index.ts",
      permissions: [],
    };

    __officialExtensionsTestUtils.setPreparedInstall({
      token: "success-token",
      entry: {
        id: "karabiner.draw",
        slug: "draw",
        name: "Draw",
        version: "0.0.1",
      },
      manifest,
      readme: "# Draw extension",
      extractedExtensionDirectory: extractedDir,
      tempDirectory: tempRoot,
      expiresAt: Date.now() + 60_000,
    });

    const extensionsRoot = await mkdtemp(join(tmpdir(), "karabiner-ext-install-root-"));
    cleanupPaths.push(extensionsRoot);

    const extensionDirectory = await installPreparedOfficialExtension(
      extensionsRoot,
      "karabiner.draw",
      "success-token",
    );

    const installedManifest = JSON.parse(
      await readFile(join(extensionDirectory, "extension.json"), "utf8"),
    ) as ExtensionManifest;
    expect(installedManifest.id).toBe("karabiner.draw");
    expect(installedManifest.entrypoint).toBe("runtime/index.mjs");
    expect(await pathExists(join(extensionDirectory, "runtime/index.mjs"))).toBe(true);
    expect(await readFile(join(extensionDirectory, "README.md"), "utf8")).toBe(
      "# Draw extension\n",
    );
    expect(__officialExtensionsTestUtils.hasPreparedInstall("success-token")).toBe(false);
    expect(await pathExists(tempRoot)).toBe(false);
  });
});
