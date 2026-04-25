import { main } from '@/renderer/relay';
// This file contains methods that can be used by both the main and renderer processes for file system operations, ensuring consistent path handling across the app.

function getWorld(): "main" | "renderer" {
	if (typeof window === "undefined") {
		return "main";
	} else {
		return "renderer";
	}
}

function getHomeDir() {
	if (getWorld() === "main") {
		return process.env.HOME || process.env.USERPROFILE || '';
	}
	return main.querySync("homeDir") as string;
}

function getPlatform() {
	if (getWorld() === "main") {
		const platform = process.platform;
		switch (platform) {
			case 'darwin':
				return 'darwin';
			case 'win32':
				return 'win32';
			case 'linux':
				return 'linux';
			default:
				return 'unknown';
		}
	}
	return main.querySync("platform") as "darwin" | "win32" | "linux" | "unknown";
}

function join(...paths: string[]) {
	const sep = getPlatform() === 'win32' ? '\\' : '/';
	return paths.join(sep).replace(new RegExp(`[${sep}]+`, 'g'), sep);
}

function resolve(...paths: string[]) {
	const sep = getPlatform() === 'win32' ? '\\' : '/';

	// exact implementation of path.resolve for our specific use case
	let resolvedPath = "";
	for (const p of paths) {
		if (p.startsWith(sep)) {
			resolvedPath = p;
		} else {
			if (!resolvedPath.endsWith(sep) && resolvedPath !== "") {
				resolvedPath += sep;
			}
			resolvedPath += p;
		}
	}

	const parts = resolvedPath.split(sep);
	const stack: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") {
			continue;
		} else if (part === "..") {
			stack.pop();
		} else {
			stack.push(part);
		}
	}

	return (resolvedPath.startsWith(sep) ? sep : "") + stack.join(sep);
}

export namespace Path {

	export const sep = getPlatform() === 'win32' ? '\\' : '/';

	/**
	 * Normalizes a path by resolving `~` to the user's home directory and converting it to an absolute path. 
	 * This ensures consistent path handling across both main and renderer processes.
	 */
	export function normalize(p: string): string {
		// correct for both absolute and relative paths, and for both main and renderer processes
		if (p.startsWith("~")) {
			return join(getHomeDir() || "", p.slice(1));
		}

		// correct separators
		p = p.split(/[/\\]+/).join(sep);

		// resolve the path to eliminate any `.` or `..` segments
		return resolve(p);
	}

	/**
	 * Splits a path into its directory and base components. For example, "/foo/bar/baz.txt" would be split 
	 * into ["/foo/bar", "baz.txt"].
	 */
	export function split(p: string): [string, string] {
		p = normalize(p);
		
		const sep = getPlatform() === 'win32' ? '\\' : '/';

		if (!p.includes(sep)) {
			return [".", p];
		}

		const parts = p.split(sep);
		const base = parts.pop() || "";
		const dir = parts.join(sep) || (p.startsWith(sep) ? sep : ".");
		return [dir, base];
	}
}
