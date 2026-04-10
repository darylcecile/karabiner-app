import { $ } from "bun";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionManifest,
  OfficialExtensionInstallPlan,
} from "../../../shared/contracts/extensions";
import { loadExtensionManifest } from "../manifest";

const REGISTRY_FILENAME = "registry.karabiner.json";
const DEV_EXTENSIONS_DIRECTORY = "extensions";
const BUNDLED_EXTENSIONS_DIRECTORY = "official-extensions";
const OFFICIAL_REGISTRY_OWNER = "darylcecile";
const OFFICIAL_REGISTRY_REPO = "karabiner-app";
const OFFICIAL_REGISTRY_REF = Bun.env.KARABINER_OFFICIAL_REGISTRY_REF ?? "main";
const OFFICIAL_REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;
const PREPARED_INSTALL_TTL_MS = 10 * 60 * 1000;
const SDK_MODULE_SPECIFIER = "@karabiner/sdk";

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

type PreparedOfficialInstall = {
  token: string;
  entry: OfficialRegistryEntry;
  manifest: ExtensionManifest;
  readme: string;
  extractedExtensionDirectory: string;
  tempDirectory: string;
  expiresAt: number;
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

type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  assets: GithubReleaseAsset[];
};

type OfficialReleaseAsset = {
  tagName: string;
  assetName: string;
  downloadUrl: string;
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
const preparedInstalls = new Map<string, PreparedOfficialInstall>();

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

export async function prepareOfficialExtensionInstall(
  extensionId: string,
): Promise<OfficialExtensionInstallPlan> {
  await clearExpiredPreparedInstalls();

  const registry = await readOfficialRegistry();
  const entry = registry.extensions.find((candidate) => candidate.id === extensionId);
  if (!entry) {
    throw new Error(`Unknown official extension "${extensionId}".`);
  }

  const releaseAsset = await resolveOfficialReleaseAsset(entry);
  const tempDirectory = await mkdtemp(
    join(tmpdir(), `karabiner-official-install-${entry.slug}-`),
  );
  const archivePath = join(tempDirectory, `${entry.slug}.tar.gz`);
  const extractedDirectory = join(tempDirectory, "extracted");
  await mkdir(extractedDirectory, { recursive: true });

  try {
    const archiveBytes = await downloadOfficialReleaseAsset(releaseAsset);
    await writeFile(archivePath, archiveBytes);
    await extractTarball(archivePath, extractedDirectory);
    const extractedExtensionDirectory = await resolveExtractedExtensionDirectory(
      extractedDirectory,
      entry.slug,
    );

    const manifestResult = await loadExtensionManifest(extractedExtensionDirectory);
    if (!manifestResult.ok) {
      const details = manifestResult.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid extension manifest in release bundle. ${details}`);
    }
    if (manifestResult.manifest.id !== entry.id) {
      throw new Error(
        `Release bundle id "${manifestResult.manifest.id}" does not match registry id "${entry.id}".`,
      );
    }

    const readmePath = join(extractedExtensionDirectory, "README.md");
    const readme = (await pathExists(readmePath))
      ? await readFile(readmePath, "utf8")
      : "";
    const token = randomUUID();
    preparedInstalls.set(token, {
      token,
      entry,
      manifest: manifestResult.manifest,
      readme,
      extractedExtensionDirectory,
      tempDirectory,
      expiresAt: Date.now() + PREPARED_INSTALL_TTL_MS,
    });

    return {
      installToken: token,
      id: manifestResult.manifest.id,
      name: manifestResult.manifest.name,
      description: manifestResult.manifest.description ?? entry.description,
      version: manifestResult.manifest.version,
      permissions: manifestResult.manifest.permissions,
    };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function installPreparedOfficialExtension(
  extensionsDirectory: string,
  extensionId: string,
  installToken: string,
): Promise<string> {
  await clearExpiredPreparedInstalls();
  const prepared = preparedInstalls.get(installToken);
  if (!prepared) {
    throw new Error("Install approval expired. Please review permissions and try again.");
  }
  if (prepared.entry.id !== extensionId) {
    throw new Error(
      `Install token is for "${prepared.entry.id}", but "${extensionId}" was requested.`,
    );
  }

  preparedInstalls.delete(installToken);
  try {
    const runtimeEntrypointSource = await buildRuntimeEntrypoint(prepared);
    const extensionDirectory = join(extensionsDirectory, prepared.manifest.id);
    await rm(extensionDirectory, { recursive: true, force: true });
    await mkdir(join(extensionDirectory, "runtime"), { recursive: true });

    const installManifest: ExtensionManifest = {
      ...prepared.manifest,
      entrypoint: "runtime/index.mjs",
    };
    await writeFile(
      join(extensionDirectory, "extension.json"),
      `${JSON.stringify(installManifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(extensionDirectory, "runtime/index.mjs"),
      runtimeEntrypointSource,
      "utf8",
    );
    if (prepared.readme.trim().length > 0) {
      await writeFile(
        join(extensionDirectory, "README.md"),
        `${prepared.readme.trim()}\n`,
        "utf8",
      );
    }

    return extensionDirectory;
  } finally {
    await rm(prepared.tempDirectory, { recursive: true, force: true });
  }
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
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO}/contents/${REGISTRY_FILENAME}?ref=${OFFICIAL_REGISTRY_REF}`,
      { headers: buildGithubApiHeaders() },
    );
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

async function resolveOfficialReleaseAsset(
  entry: OfficialRegistryEntry,
): Promise<OfficialReleaseAsset> {
  const releases = await readOfficialRepoReleases();
  const assetName = `${entry.slug}.tar.gz`;
  for (const release of releases) {
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    if (asset) {
      return {
        tagName: release.tag_name,
        assetName,
        downloadUrl: asset.browser_download_url,
      };
    }
  }
  throw new Error(
    `No release asset named "${assetName}" found in ${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO} releases.`,
  );
}

async function readOfficialRepoReleases(): Promise<GithubRelease[]> {
  const path = `repos/${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO}/releases?per_page=20`;
  const ghResult = await tryReadGithubJsonViaGhCli(path);
  if (ghResult.ok) {
    return parseGithubReleases(ghResult.value);
  }
  const apiResult = await tryReadGithubJsonViaApi(path);
  if (apiResult.ok) {
    return parseGithubReleases(apiResult.value);
  }
  throw new Error(
    `Failed to load GitHub releases. gh CLI: ${ghResult.error}. GitHub API: ${apiResult.error}.`,
  );
}

async function downloadOfficialReleaseAsset(
  releaseAsset: OfficialReleaseAsset,
): Promise<Uint8Array> {
  const ghResult = await tryDownloadOfficialReleaseAssetViaGhCli(releaseAsset);
  if (ghResult.ok) {
    return ghResult.bytes;
  }

  const response = await fetch(releaseAsset.downloadUrl, {
    headers: buildGithubApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download release asset "${releaseAsset.assetName}" (tag "${releaseAsset.tagName}") from "${releaseAsset.downloadUrl}". gh CLI: ${ghResult.error}. HTTP ${response.status}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function tryDownloadOfficialReleaseAssetViaGhCli(
  releaseAsset: OfficialReleaseAsset,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const ghBinary = Bun.which("gh");
  if (!ghBinary) {
    return {
      ok: false,
      error: "gh CLI is not available",
    };
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "karabiner-release-asset-"));
  const outputPath = join(tempDirectory, releaseAsset.assetName);
  try {
    await $`${ghBinary} release download ${releaseAsset.tagName} --repo ${OFFICIAL_REGISTRY_OWNER}/${OFFICIAL_REGISTRY_REPO} --pattern ${releaseAsset.assetName} --output ${outputPath}`.quiet();
    return {
      ok: true,
      bytes: new Uint8Array(await readFile(outputPath)),
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function extractTarball(
  archivePath: string,
  outputDirectory: string,
): Promise<void> {
  const tarBinary = Bun.which("tar");
  if (!tarBinary) {
    throw new Error("tar binary is required to extract official extension bundles.");
  }
  await $`${tarBinary} -xzf ${archivePath} -C ${outputDirectory}`.quiet();
}

async function resolveExtractedExtensionDirectory(
  extractRoot: string,
  expectedSlug: string,
): Promise<string> {
  const directCandidate = join(extractRoot, expectedSlug);
  if (await hasManifestFile(directCandidate)) {
    return directCandidate;
  }

  const discovered = await findManifestDirectory(extractRoot, 3);
  if (!discovered) {
    throw new Error("Extracted extension bundle did not contain extension.json.");
  }
  return discovered;
}

async function findManifestDirectory(
  rootDirectory: string,
  maxDepth: number,
): Promise<string | null> {
  if (maxDepth < 0) {
    return null;
  }
  if (await hasManifestFile(rootDirectory)) {
    return rootDirectory;
  }
  if (maxDepth === 0) {
    return null;
  }

  const entries = await readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const childPath = join(rootDirectory, entry.name);
    const found = await findManifestDirectory(childPath, maxDepth - 1);
    if (found) {
      return found;
    }
  }
  return null;
}

async function hasManifestFile(directory: string): Promise<boolean> {
  return pathExists(join(directory, "extension.json"));
}

async function buildRuntimeEntrypoint(
  prepared: PreparedOfficialInstall,
): Promise<string> {
  const sourceEntrypoint = resolve(
    prepared.extractedExtensionDirectory,
    prepared.manifest.entrypoint,
  );
  const buildOutputDirectory = join(prepared.tempDirectory, "build");
  await mkdir(buildOutputDirectory, { recursive: true });

  const buildResult = await Bun.build({
    entrypoints: [sourceEntrypoint],
    outdir: buildOutputDirectory,
    target: "browser",
    format: "esm",
    splitting: false,
    sourcemap: "none",
    external: [SDK_MODULE_SPECIFIER],
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
      `Failed to compile extension "${prepared.manifest.id}" for runtime install.\n${diagnostics}`,
    );
  }

  const entrypointOutput = buildResult.outputs.find(
    (output) => output.path.endsWith(".mjs") || output.path.endsWith(".js"),
  );
  if (!entrypointOutput) {
    throw new Error(
      `Bundling extension "${prepared.manifest.id}" did not produce a JavaScript entrypoint.`,
    );
  }
  return readFile(entrypointOutput.path, "utf8");
}

async function clearExpiredPreparedInstalls(): Promise<void> {
  const now = Date.now();
  const expired = [...preparedInstalls.values()].filter(
    (install) => install.expiresAt <= now,
  );
  for (const install of expired) {
    preparedInstalls.delete(install.token);
    await rm(install.tempDirectory, { recursive: true, force: true });
  }
}

function getRegistryPathCandidates(): string[] {
  const candidates = new Set<string>();
  for (const baseDirectory of getRuntimeBaseDirectories()) {
    candidates.add(resolve(baseDirectory, REGISTRY_FILENAME));
    candidates.add(resolve(baseDirectory, "bun", REGISTRY_FILENAME));
  }
  return [...candidates];
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

function buildGithubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "karabiner-app",
  };
  const token = Bun.env.GH_TOKEN ?? Bun.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseGithubReleases(value: unknown): GithubRelease[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub releases response must be an array.");
  }
  return value.map((release) => parseGithubRelease(release));
}

function parseGithubRelease(value: unknown): GithubRelease {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GitHub release entry must be an object.");
  }
  const release = value as Record<string, unknown>;
  if (typeof release.tag_name !== "string") {
    throw new Error("GitHub release is missing tag_name.");
  }
  if (!Array.isArray(release.assets)) {
    throw new Error(`GitHub release "${release.tag_name}" is missing assets.`);
  }
  const assets = release.assets.map((asset) => parseGithubReleaseAsset(asset));
  return {
    tag_name: release.tag_name,
    assets,
  };
}

function parseGithubReleaseAsset(value: unknown): GithubReleaseAsset {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GitHub release asset must be an object.");
  }
  const asset = value as Record<string, unknown>;
  if (typeof asset.name !== "string" || asset.name.length === 0) {
    throw new Error("GitHub release asset is missing name.");
  }
  if (
    typeof asset.browser_download_url !== "string" ||
    asset.browser_download_url.length === 0
  ) {
    throw new Error(`GitHub release asset "${asset.name}" is missing download URL.`);
  }
  return {
    name: asset.name,
    browser_download_url: asset.browser_download_url,
  };
}

async function tryReadGithubJsonViaGhCli(path: string): Promise<
  | { ok: true; value: unknown }
  | { ok: false; error: string }
> {
  const ghBinary = Bun.which("gh");
  if (!ghBinary) {
    return {
      ok: false,
      error: "gh CLI is not available",
    };
  }
  try {
    const raw = await $`${ghBinary} api ${path}`.quiet().text();
    return {
      ok: true,
      value: JSON.parse(raw) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
    };
  }
}

async function tryReadGithubJsonViaApi(path: string): Promise<
  | { ok: true; value: unknown }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch(`https://api.github.com/${path}`, {
      headers: buildGithubApiHeaders(),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      value: (await response.json()) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
