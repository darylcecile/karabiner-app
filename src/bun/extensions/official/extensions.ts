import { access, cp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ExtensionManifest } from "../../../shared/contracts/extensions";

const REGISTRY_FILENAME = "registry.karabiner.json";
const DEV_EXTENSIONS_DIRECTORY = "extensions";
const BUNDLED_EXTENSIONS_DIRECTORY = "official-extensions";

type OfficialRegistryEntry = {
  id: string;
  slug: string;
  name?: string;
  description?: string;
  version?: string;
};

type OfficialRegistry = {
  registryVersion: 1;
  extensions: OfficialRegistryEntry[];
};

type OfficialSourceRoot = {
  registryPath: string;
  extensionsDirectory: string;
};

type OfficialExtensionBundle = {
  entry: OfficialRegistryEntry;
  manifest: ExtensionManifest;
  readme: string;
  extensionDirectory: string;
};

export type OfficialExtensionMetadata = {
  id: string;
  name: string;
  description?: string;
  version: string;
};

export type OfficialExtensionReadme = OfficialExtensionMetadata & {
  readme: string;
};

export async function listOfficialExtensions(): Promise<OfficialExtensionMetadata[]> {
  const registry = await readOfficialRegistry();
  const extensions = await Promise.all(
    registry.extensions.map(async (entry) => {
      const bundle = await readOfficialExtensionBundle(entry);
      return {
        id: bundle.manifest.id,
        name: bundle.manifest.name,
        description: bundle.manifest.description ?? entry.description,
        version: bundle.manifest.version,
      };
    }),
  );
  return extensions.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readOfficialExtension(
  extensionId: string,
): Promise<OfficialExtensionReadme> {
  const registry = await readOfficialRegistry();
  const entry = registry.extensions.find((candidate) => candidate.id === extensionId);
  if (!entry) {
    throw new Error(`Unknown official extension "${extensionId}".`);
  }
  const bundle = await readOfficialExtensionBundle(entry);
  return {
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    description: bundle.manifest.description ?? entry.description,
    version: bundle.manifest.version,
    readme: bundle.readme,
  };
}

export async function installOfficialExtension(
  extensionsDirectory: string,
  extensionId: string,
): Promise<string> {
  const registry = await readOfficialRegistry();
  const entry = registry.extensions.find((candidate) => candidate.id === extensionId);
  if (!entry) {
    throw new Error(`Unknown official extension "${extensionId}".`);
  }
  const bundle = await readOfficialExtensionBundle(entry);
  const extensionDirectory = join(extensionsDirectory, bundle.manifest.id);
  await rm(extensionDirectory, { recursive: true, force: true });
  await cp(bundle.extensionDirectory, extensionDirectory, {
    recursive: true,
    force: true,
  });
  return extensionDirectory;
}

async function readOfficialRegistry(): Promise<OfficialRegistry> {
  const sourceRoot = await resolveOfficialSourceRoot();
  const rawRegistry = await readFile(sourceRoot.registryPath, "utf8");
  const parsedRegistry = JSON.parse(rawRegistry) as unknown;
  validateRegistry(parsedRegistry);
  return parsedRegistry;
}

async function readOfficialExtensionBundle(
  entry: OfficialRegistryEntry,
): Promise<OfficialExtensionBundle> {
  const sourceRoot = await resolveOfficialSourceRoot();
  const extensionDirectory = join(sourceRoot.extensionsDirectory, entry.slug);
  const manifestPath = join(extensionDirectory, "extension.json");
  const readmePath = join(extensionDirectory, "README.md");

  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as ExtensionManifest;
  if (!manifest?.id || manifest.id !== entry.id) {
    throw new Error(
      `Official extension "${entry.id}" has mismatched manifest id "${manifest?.id ?? "unknown"}".`,
    );
  }
  const readme = await readFile(readmePath, "utf8");

  return {
    entry,
    manifest,
    readme,
    extensionDirectory,
  };
}

async function resolveOfficialSourceRoot(): Promise<OfficialSourceRoot> {
  const candidates: OfficialSourceRoot[] = [
    {
      registryPath: resolve(import.meta.dir, `../../../../${REGISTRY_FILENAME}`),
      extensionsDirectory: resolve(
        import.meta.dir,
        `../../../../${DEV_EXTENSIONS_DIRECTORY}`,
      ),
    },
    {
      registryPath: resolve(import.meta.dir, `../../${REGISTRY_FILENAME}`),
      extensionsDirectory: resolve(
        import.meta.dir,
        `../../${BUNDLED_EXTENSIONS_DIRECTORY}`,
      ),
    },
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate.registryPath) && (await pathExists(candidate.extensionsDirectory))) {
      return candidate;
    }
  }
  throw new Error(
    "Unable to resolve official extension source. Missing registry.karabiner.json or extensions directory.",
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function validateRegistry(value: unknown): asserts value is OfficialRegistry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("registry.karabiner.json must contain an object.");
  }

  const registry = value as Record<string, unknown>;
  if (registry.registryVersion !== 1) {
    throw new Error("registry.karabiner.json must set registryVersion to 1.");
  }

  if (!Array.isArray(registry.extensions)) {
    throw new Error("registry.karabiner.json must define an extensions array.");
  }

  for (const extension of registry.extensions) {
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
      throw new Error("Each registry extension entry must be an object.");
    }
    const entry = extension as Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      throw new Error("Each registry extension entry must include a non-empty id.");
    }
    if (typeof entry.slug !== "string" || entry.slug.trim().length === 0) {
      throw new Error(
        `Registry extension "${entry.id}" must include a non-empty slug.`,
      );
    }
  }
}
