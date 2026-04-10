import { normalize, sep } from "node:path";
import type { ExtensionResolvedFilePreview } from "../../../shared/contracts/extensions";

export function normalizeFileExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 2 ||
    !normalized.startsWith(".") ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new Error(
      `Invalid file extension "${value}". Expected values like ".tldraw".`,
    );
  }
  return normalized;
}

export function resolvePreviewContentType(
  value: unknown,
): ExtensionResolvedFilePreview["contentType"] {
  if (value === undefined || value === "text") {
    return "text";
  }
  if (value === "markdown" || value === "json" || value === "tldraw") {
    return value;
  }
  throw new Error(
    'File preview contentType must be "text", "markdown", "json", or "tldraw".',
  );
}

export function matchesNetworkAllowlist(
  entry: string,
  host: string,
  port: number,
): boolean {
  const normalizedEntry = entry.trim().toLowerCase();
  if (normalizedEntry.length === 0) {
    return false;
  }

  const [entryHost, entryPort] = normalizedEntry.split(":");
  if (entryPort && Number(entryPort) !== port) {
    return false;
  }

  if (entryHost.startsWith("*.")) {
    const suffix = entryHost.slice(1);
    return host.endsWith(suffix);
  }
  return host === entryHost;
}

export function isWithinPathBoundary(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  if (normalizedCandidate === normalizedRoot) {
    return true;
  }
  return normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}
