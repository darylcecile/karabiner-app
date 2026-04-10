import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EXTENSION_MANIFEST_VERSION,
  type ExtensionManifest,
  type InstalledExtension,
} from "../../shared/contracts/extensions";
import {
  EXTENSION_PERMISSION_IDS,
  type ExtensionPermission,
  type ExtensionPermissionId,
} from "../../shared/contracts/permissions";

const EXTENSION_MANIFEST_FILENAME = "extension.json";
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const EXTENSION_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export type ManifestValidationIssue = {
  path: string;
  message: string;
};

export type ManifestValidationResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; issues: ManifestValidationIssue[] };

export async function loadExtensionManifest(
  extensionRoot: string,
): Promise<ManifestValidationResult> {
  const manifestPath = join(extensionRoot, EXTENSION_MANIFEST_FILENAME);
  const rawManifest = await readFile(manifestPath, "utf8");
  const parsedManifest: unknown = JSON.parse(rawManifest);
  return validateExtensionManifest(parsedManifest);
}

export function createInstalledExtensionRecord(params: {
  extensionRoot: string;
  manifest: ExtensionManifest;
  installSource: InstalledExtension["installSource"];
}): InstalledExtension {
  return {
    manifest: params.manifest,
    rootDir: params.extensionRoot,
    installSource: params.installSource,
    installedAt: new Date().toISOString(),
  };
}

export function validateExtensionManifest(
  manifest: unknown,
): ManifestValidationResult {
  const issues: ManifestValidationIssue[] = [];
  const candidate = asObject(manifest, issues, "$");
  if (!candidate) {
    return { ok: false, issues };
  }

  const manifestVersion = candidate.manifestVersion;
  if (manifestVersion !== EXTENSION_MANIFEST_VERSION) {
    issues.push({
      path: "$.manifestVersion",
      message: `manifestVersion must be ${EXTENSION_MANIFEST_VERSION}`,
    });
  }

  const id = readString(candidate.id, "$.id", issues);
  if (id && !EXTENSION_ID_RE.test(id)) {
    issues.push({
      path: "$.id",
      message:
        "id must use lowercase alphanumerics with optional '.' or '-' separators",
    });
  }

  const name = readString(candidate.name, "$.name", issues);
  if (name && name.length > 80) {
    issues.push({
      path: "$.name",
      message: "name must be 80 characters or less",
    });
  }

  const version = readString(candidate.version, "$.version", issues);
  if (version && !SEMVER_RE.test(version)) {
    issues.push({
      path: "$.version",
      message: "version must follow semver (e.g. 1.0.0)",
    });
  }

  const entrypoint = readString(candidate.entrypoint, "$.entrypoint", issues);
  if (entrypoint && !isSafeRelativeEntrypoint(entrypoint)) {
    issues.push({
      path: "$.entrypoint",
      message: "entrypoint must be a safe relative file path",
    });
  }

  const permissions = candidate.permissions;
  if (!Array.isArray(permissions)) {
    issues.push({
      path: "$.permissions",
      message: "permissions must be an array",
    });
  } else {
    for (const [index, permission] of permissions.entries()) {
      validatePermission(permission, `$.permissions[${index}]`, issues);
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, manifest: candidate as ExtensionManifest };
}

function validatePermission(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  const permission = asObject(value, issues, path);
  if (!permission) {
    return;
  }

  const id = readString(permission.id, `${path}.id`, issues);
  if (!id) {
    return;
  }
  if (!isKnownPermissionId(id)) {
    issues.push({
      path: `${path}.id`,
      message: `unknown permission id "${id}"`,
    });
    return;
  }

  readString(permission.reason, `${path}.reason`, issues);
  validatePermissionSpecificFields(
    id,
    permission as Record<string, unknown>,
    path,
    issues,
  );
}

function validatePermissionSpecificFields(
  permissionId: ExtensionPermissionId,
  permission: Record<string, unknown>,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  if (
    permissionId === "filesystem.read" ||
    permissionId === "filesystem.write"
  ) {
    readStringArray(permission.roots, `${path}.roots`, issues);
  }

  if (permissionId === "network") {
    readStringArray(permission.allowlist, `${path}.allowlist`, issues);
  }

  if (permissionId === "ai.provider") {
    readStringArray(permission.providerIds, `${path}.providerIds`, issues);
  }

  if (permissionId === "cli.exec") {
    readStringArray(permission.commands, `${path}.commands`, issues);
  }
}

function asObject(
  value: unknown,
  issues: ManifestValidationIssue[],
  path: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ path, message: "must be an object" });
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "must be a non-empty string" });
    return null;
  }
  return value;
}

function readStringArray(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "must be a non-empty string array" });
    return null;
  }
  if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push({ path, message: "all entries must be non-empty strings" });
    return null;
  }
  return value as string[];
}

function isKnownPermissionId(value: string): value is ExtensionPermissionId {
  return EXTENSION_PERMISSION_IDS.includes(value as ExtensionPermissionId);
}

function isSafeRelativeEntrypoint(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("\\") || value.includes("..")) {
    return false;
  }
  return value.endsWith(".js") || value.endsWith(".mjs") || value.endsWith(".ts");
}

export function describeRequestedPermissions(
  permissions: ExtensionPermission[],
): string[] {
  return permissions.map((permission) => `${permission.id}: ${permission.reason}`);
}
