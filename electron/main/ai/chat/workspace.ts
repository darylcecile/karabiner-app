import path from "node:path";

/**
 * Workspace root used by chat tools. Mirrors the vault path created in
 * electron/main/fs.ts (`setUpAppDir`).
 */
export function getWorkspaceRoot(): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	return path.resolve(path.join(home, ".karabiner", "vault"));
}

/**
 * Resolve a user-provided path to an absolute path that is guaranteed to live
 * inside the workspace root. Throws if the resolved path escapes the root.
 *
 * Lenient handling: if the path starts with `/workspace/` (the mount point used
 * by the sandboxed bash tool), that prefix is stripped so the path is treated
 * as workspace-relative. Models often conflate the two and we want all the
 * file-oriented tools to share a single user-facing path convention.
 */
export function resolveInsideWorkspace(inputPath: string): string {
	const root = getWorkspaceRoot();
	let normalized = inputPath;
	if (normalized === "/workspace") normalized = "";
	else if (normalized.startsWith("/workspace/")) normalized = normalized.slice("/workspace/".length);
	const candidate = path.isAbsolute(normalized)
		? path.resolve(normalized)
		: path.resolve(root, normalized);
	const rel = path.relative(root, candidate);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path escapes workspace: ${inputPath}`);
	}
	return candidate;
}
