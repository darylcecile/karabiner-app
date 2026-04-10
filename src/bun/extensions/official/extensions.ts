import { $ } from "bun";
import { Buffer } from "node:buffer";
import { access, cp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionManifest } from "../../../shared/contracts/extensions";

const REGISTRY_FILENAME = "registry.karabiner.json";
const DEV_EXTENSIONS_DIRECTORY = "extensions";
const BUNDLED_EXTENSIONS_DIRECTORY = "official-extensions";
const OFFICIAL_REGISTRY_OWNER = "darylcecile";
const OFFICIAL_REGISTRY_REPO = "karabiner-app";
const OFFICIAL_REGISTRY_REF = Bun.env.KARABINER_OFFICIAL_REGISTRY_REF ?? "main";
const OFFICIAL_REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;

type OfficialRegistryEntry = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  version: string;
};

type OfficialRegistry = {
  registryVersion: 1;
  extensions: OfficialRegistryEntry[];
};

type OfficialExtensionBundle = {
  entry: OfficialRegistryEntry;
  manifest: ExtensionManifest;
  readme: string;
  extensionDirectory: string;
};

type RegistryContentLoadResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      error: string;
    };

type GithubContentResponse = {
  content: string;
  encoding: string;
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

let cachedRegistry: { value: OfficialRegistry; expiresAt: number } | null = null;

export async function listOfficialExtensions(): Promise<OfficialExtensionMetadata[]> {
  let registry: OfficialRegistry;
  try {
    registry = await readOfficialRegistry();
  } catch (error) {
    console.error("[bun] failed to load official extension registry", error);
    return [];
  }
  const extensions = registry.extensions.map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
  }));
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
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
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
  const now = Date.now();
  if (cachedRegistry && cachedRegistry.expiresAt > now) {
    return cachedRegistry.value;
  }
  const rawRegistry = await readRegistryContent();
  const parsedRegistry = JSON.parse(rawRegistry) as unknown;
  validateRegistry(parsedRegistry);
  cachedRegistry = {
    value: parsedRegistry,
    expiresAt: now + OFFICIAL_REGISTRY_CACHE_TTL_MS,
  };
  return parsedRegistry;
}

async function readOfficialExtensionBundle(
  entry: OfficialRegistryEntry,
): Promise<OfficialExtensionBundle> {
  const sourceDirectory = await resolveOfficialExtensionsDirectory();
  const extensionDirectory = join(sourceDirectory, entry.slug);
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

async function readRegistryContent(): Promise<string> {
  const ghResult = await tryReadRegistryViaGhCli();
  if (ghResult.ok) {
    return ghResult.content;
  }

  const apiResult = await tryReadRegistryViaGithubApi();
  if (apiResult.ok) {
    return apiResult.content;
  }

  const localResult = await tryReadRegistryFromLocalFile();
  if (localResult.ok) {
    return localResult.content;
  }

  throw new Error(
    `Failed to load ${REGISTRY_FILENAME} via gh CLI, GitHub API, or local fallback. gh CLI: ${ghResult.error}. GitHub API: ${apiResult.error}. Local: ${localResult.error}.`,
  );
}

async function tryReadRegistryViaGhCli(): Promise<RegistryContentLoadResult> {
  const ghBinary = Bun.which("gh");
  if (!ghBinary) {
    return {
      ok: false,
      error: "gh CLI is not available",
    };
  }

  try {
    const responseText = await $`${ghBinary} api repos/${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO}/contents/${REGISTRY_FILENAME} -f ref=${OFFICIAL_REGISTRY_REF}`
      .quiet()
      .text();
    const parsed = parseGithubContentResponse(JSON.parse(responseText) as unknown);
    return {
      ok: true,
      content: decodeBase64Content(parsed),
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
    };
  }
}

async function tryReadRegistryViaGithubApi(): Promise<RegistryContentLoadResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "karabiner-app",
  };
  const token = Bun.env.GH_TOKEN ?? Bun.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO}/contents/${REGISTRY_FILENAME}?ref=${OFFICIAL_REGISTRY_REF}`;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }
    const parsed = parseGithubContentResponse((await response.json()) as unknown);
    return {
      ok: true,
      content: decodeBase64Content(parsed),
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
    };
  }
}

async function tryReadRegistryFromLocalFile(): Promise<RegistryContentLoadResult> {
  const candidates = getRegistryPathCandidates();

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }
    try {
      const content = await readFile(candidate, "utf8");
      return {
        ok: true,
        content,
      };
    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
      };
    }
  }

  return {
    ok: false,
    error: "registry file not found",
  };
}

async function resolveOfficialExtensionsDirectory(): Promise<string> {
  const candidates = getExtensionDirectoryCandidates();

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Unable to resolve official extension source. Missing extensions directory.",
  );
}

function getRegistryPathCandidates(): string[] {
  const candidates = new Set<string>();
  for (const baseDirectory of getRuntimeBaseDirectories()) {
    candidates.add(resolve(baseDirectory, REGISTRY_FILENAME));
    candidates.add(resolve(baseDirectory, "bun", REGISTRY_FILENAME));
  }
  return [...candidates];
}

function getExtensionDirectoryCandidates(): string[] {
  const candidates = new Set<string>();
  for (const baseDirectory of getRuntimeBaseDirectories()) {
    candidates.add(resolve(baseDirectory, DEV_EXTENSIONS_DIRECTORY));
    candidates.add(resolve(baseDirectory, BUNDLED_EXTENSIONS_DIRECTORY));
    candidates.add(resolve(baseDirectory, "bun", DEV_EXTENSIONS_DIRECTORY));
    candidates.add(resolve(baseDirectory, "bun", BUNDLED_EXTENSIONS_DIRECTORY));
  }
  return [...candidates];
}

function getRuntimeBaseDirectories(): string[] {
  const directories = new Set<string>([
    resolve(import.meta.dir, "../../../../"),
    resolve(import.meta.dir, "../../"),
    process.cwd(),
  ]);

  const bunMainDirectory = resolveBunMainDirectory();
  if (bunMainDirectory) {
    directories.add(bunMainDirectory);
    directories.add(resolve(bunMainDirectory, ".."));
    directories.add(resolve(bunMainDirectory, "../.."));
  }

  return [...directories];
}

function resolveBunMainDirectory(): string | null {
  if (!Bun.main || Bun.main.length === 0) {
    return null;
  }
  try {
    if (Bun.main.startsWith("file://")) {
      return dirname(fileURLToPath(Bun.main));
    }
    return dirname(Bun.main);
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseGithubContentResponse(value: unknown): GithubContentResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GitHub contents response must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.content !== "string" || record.content.length === 0) {
    throw new Error("GitHub contents response is missing content.");
  }
  if (typeof record.encoding !== "string" || record.encoding.length === 0) {
    throw new Error("GitHub contents response is missing encoding.");
  }
  return {
    content: record.content,
    encoding: record.encoding,
  };
}

function decodeBase64Content(response: GithubContentResponse): string {
  if (response.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding "${response.encoding}".`);
  }
  const normalizedContent = response.content.replace(/\n/g, "");
  return Buffer.from(normalizedContent, "base64").toString("utf8");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
    if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
      throw new Error(
        `Registry extension "${entry.id}" must include a non-empty name.`,
      );
    }
    if (typeof entry.version !== "string" || entry.version.trim().length === 0) {
      throw new Error(
        `Registry extension "${entry.id}" must include a non-empty version.`,
      );
    }
  }
}
