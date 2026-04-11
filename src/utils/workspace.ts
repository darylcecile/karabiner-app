import type { readFile, writeFile } from "node:fs/promises";
import type { DirectoryEntry } from "../bun/type";
import { electroview } from "../mainview/rpc";

export class WorkspaceFile {
	constructor(public readonly path: string) {}
}

export class WorkspaceDirectory {
	#children: (WorkspaceFile | WorkspaceDirectory)[] = [];
	#isLoaded = false;

	constructor(public readonly path: string) {}

	get isLoaded() {
		return this.#isLoaded;
	}

	getChildren(): (WorkspaceFile | WorkspaceDirectory)[] {
		return this.#children;
	}

	async load() {
		if (this.#isLoaded) {
			return this.#children;
		}

		const rpc = electroview.rpc;
		if (!rpc) {
			throw new Error("Workspace RPC is not available");
		}

		const items = await rpc.request.listDirectory([this.path]);

		this.#children = items.map((item) => {
			const childPath = joinPath(this.path, item.name);
			return item.isDirectory
				? new WorkspaceDirectory(childPath)
				: new WorkspaceFile(childPath);
		});
		this.#isLoaded = true;

		return this.#children;
	}

	find(path: string): WorkspaceFile | WorkspaceDirectory | null {
		const normalizedPath = normalizePath(path);
		if (this.path === normalizedPath) {
			return this;
		}

		for (const child of this.#children) {
			if (child.path === normalizedPath) {
				return child;
			}
			if (child instanceof WorkspaceDirectory) {
				const result = child.find(normalizedPath);
				if (result) {
					return result;
				}
			}
		}

		return null;
	}

	upsertChild(entry: DirectoryEntry) {
		const childPath = joinPath(this.path, entry.name);
		if (this.#children.some((child) => child.path === childPath)) {
			return;
		}

		this.#children = [
			...this.#children,
			entry.isDirectory
				? new WorkspaceDirectory(childPath)
				: new WorkspaceFile(childPath),
		];
	}
}

export class Workspace {
	public readonly root: WorkspaceDirectory;

	private constructor(public readonly path: string) {
		this.path = normalizePath(path);
		this.root = new WorkspaceDirectory(this.path);
	}

	static async from(path: string) {
		const workspace = new Workspace(path);
		await workspace.root.load();
		return workspace;
	}

	static get host() {
		return electroview.rpc?.request
	}

	static async getHomePath() {
		const rpc = electroview.rpc;
		if (!rpc) {
			throw new Error("Workspace RPC is not available");
		}

		return rpc.request.getHomeDirectory();
	}

	listPaths(path?: string): string[] {
		const directory = this.#getDirectory(path);
		if (!directory) {
			return [];
		}

		return flattenVisiblePaths(directory);
	}

	async loadMore(path = this.path): Promise<string[]> {
		const directory = this.#getDirectory(path);
		if (!directory) {
			return [];
		}

		const children = await directory.load();
		return children.map((child) => child.path);
	}

	async read(
		path: string,
		options?: Parameters<typeof readFile>[1],
	): Promise<Awaited<ReturnType<typeof readFile>>> {
		const targetPath = this.#resolvePath(path);
		const rpc = electroview.rpc;
		if (!rpc) {
			throw new Error("Workspace RPC is not available");
		}

		return rpc.request.readFile([targetPath, options]);
	}

	async write(
		path: string,
		data: Parameters<typeof writeFile>[1],
		options?: Parameters<typeof writeFile>[2],
	): Promise<void> {
		const targetPath = this.#resolvePath(path);
		const rpc = electroview.rpc;
		if (!rpc) {
			throw new Error("Workspace RPC is not available");
		}

		await rpc.request.writeFile([targetPath, data, options]);
		this.#upsertFile(targetPath);
	}

	#getDirectory(path?: string) {
		const targetPath = this.#resolvePath(path ?? this.path);
		const entry = this.root.find(targetPath);
		return entry instanceof WorkspaceDirectory ? entry : null;
	}

	#resolvePath(path: string) {
		const normalizedPath = normalizePath(path);
		if (
			normalizedPath === this.path ||
			normalizedPath.startsWith(`${this.path}/`)
		) {
			return normalizedPath;
		}

		const resolvedPath = normalizedPath.startsWith("/")
			? normalizedPath
			: joinPath(this.path, normalizedPath);
		if (
			resolvedPath !== this.path &&
			!resolvedPath.startsWith(`${this.path}/`)
		) {
			throw new Error(`Path is outside workspace: ${path}`);
		}

		return resolvedPath;
	}

	#upsertFile(path: string) {
		const normalizedPath = normalizePath(path);
		const segments = normalizedPath.slice(this.path.length + 1).split("/").filter(Boolean);
		if (segments.length === 0) {
			return;
		}

		let directory = this.root;
		for (const segment of segments.slice(0, -1)) {
			const childPath = joinPath(directory.path, segment);
			const child = directory.getChildren().find((entry) => entry.path === childPath);
			if (!(child instanceof WorkspaceDirectory)) {
				return;
			}
			directory = child;
			if (!directory.isLoaded) {
				return;
			}
		}

		if (!directory.isLoaded) {
			return;
		}

		directory.upsertChild({
			name: segments[segments.length - 1],
			isDirectory: false,
		});
	}
}

function flattenVisiblePaths(directory: WorkspaceDirectory): string[] {
	return directory.getChildren().flatMap((child) => {
		if (child instanceof WorkspaceDirectory) {
			return child.isLoaded
				? [child.path, ...flattenVisiblePaths(child)]
				: [child.path];
		}

		return [child.path];
	});
}

function normalizePath(path: string): string {
	if (path === "/") {
		return path;
	}

	return path.replace(/\/+/g, "/").replace(/\/$/, "");
}

function joinPath(parent: string, child: string): string {
	if (parent === "/") {
		return normalizePath(`/${child}`);
	}

	return normalizePath(`${parent}/${child}`);
}
