import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { InstalledExtension } from "../../../shared/contracts/extensions";

const RUNTIME_BUILD_DIRECTORY = ".karabiner-runtime";
const RUNTIME_BUILD_METADATA_FILE = "build-metadata.json";

type RuntimeBuildMetadata = {
  generatedAt: string;
  sourceEntrypoint: string;
  runtimeEntrypoint: string;
  buildTarget: "quickjs";
  externalizedModules: string[];
};

export async function prepareExtensionRuntimeEntrypoint(
  extension: InstalledExtension,
): Promise<string> {
  const sourceEntrypoint = resolve(extension.rootDir, extension.manifest.entrypoint);
  const runtimeOutputDirectory = join(extension.rootDir, RUNTIME_BUILD_DIRECTORY);

  await mkdir(runtimeOutputDirectory, { recursive: true });
  const buildResult = await Bun.build({
    entrypoints: [sourceEntrypoint],
    outdir: runtimeOutputDirectory,
    target: "browser",
    format: "esm",
    sourcemap: "linked",
    external: ["@karabiner/sdk"],
  });

  if (!buildResult.success) {
    const diagnostics = buildResult.logs
      .map((log) => {
        if (log.position) {
          return `${log.position.file}:${log.position.line}:${log.position.column} ${log.message}`;
        }
        return log.message;
      })
      .join("\n");
    throw new Error(
      `Failed to compile extension "${extension.manifest.id}" for isolated runtime.\n${diagnostics}`,
    );
  }

  const runtimeEntrypoint = buildResult.outputs.find(
    (output) => output.path.endsWith(".js") || output.path.endsWith(".mjs"),
  )?.path;
  if (!runtimeEntrypoint) {
    throw new Error(
      `No runtime entrypoint was emitted for extension "${extension.manifest.id}".`,
    );
  }

  const metadata: RuntimeBuildMetadata = {
    generatedAt: new Date().toISOString(),
    sourceEntrypoint,
    runtimeEntrypoint,
    buildTarget: "quickjs",
    externalizedModules: ["@karabiner/sdk"],
  };
  await writeFile(
    join(runtimeOutputDirectory, RUNTIME_BUILD_METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );

  return runtimeEntrypoint;
}
