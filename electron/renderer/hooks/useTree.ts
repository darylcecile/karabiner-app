import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirEntry } from "@/main/fs";
import { Path } from "@/shared/fsUtils";
import { main } from '@/renderer/relay';

export type NodeCustomization = {
	tint?: string | null;
	icon?: string | null;
	gitChanges?: string | null;
	[key: string]: unknown;
};

export type TreeNode = DirEntry & {
	parentPath: string | null;
	depth: number;
	children: string[];
	isLoaded: boolean;
	isLoading: boolean;
	isExpanded: boolean;
	customization?: NodeCustomization;
};

export type FileTreeNode = Omit<TreeNode, "children"> & {
	children: FileTreeNode[];
};

type TreeState = {
	rootPath: string | null;
	nodes: Record<string, TreeNode>;

	selectedPaths: string[];
	focusedPath: string | null;
	lastSelectedPath: string | null;
};

type UseFileTreeOptions = {
	includeHidden?: boolean;
	scanOnOpen?: boolean;
	scanOptions?: {
		maxDepth?: number;
		ignore?: string[];
	};
};

export type TreeItem = {
	id: string;
	name: string;
	children?: TreeItem[];
	metadata?: Record<string, any>;
};

function getBaseName(filePath: string): string {
	const normalized = Path.normalize(filePath).replace(/[\\/]$/, "");
	if (!normalized) {
		return Path.sep;
	}
	const parts = normalized.split(/[\\/]/);
	return parts.at(-1) || normalized;
}

function joinPath(parentPath: string, name: string): string {
	if (parentPath === Path.sep) {
		return Path.normalize(`${parentPath}${name}`);
	}

	return Path.normalize(`${parentPath.replace(/[\\/]$/, "")}${Path.sep}${name}`);
}

function getParentPath(filePath: string): string {
	const normalized = Path.normalize(filePath).replace(/[\\/]$/, "");
	if (!normalized || normalized === Path.sep) {
		return Path.sep;
	}
	const [parentPath] = Path.split(normalized);
	return parentPath;
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
	const normalizedRoot = Path.normalize(rootPath);
	const normalizedTarget = Path.normalize(targetPath);
	if (normalizedRoot === Path.sep) {
		return normalizedTarget.startsWith(Path.sep);
	}

	return (
		normalizedTarget === normalizedRoot ||
		normalizedTarget.startsWith(`${normalizedRoot}${Path.sep}`)
	);
}

function isPathInsideDirectory(directoryPath: string, targetPath: string): boolean {
	const normalizedDirectory = Path.normalize(directoryPath);
	const normalizedTarget = Path.normalize(targetPath);
	if (normalizedDirectory === Path.sep) {
		return normalizedTarget.startsWith(Path.sep);
	}

	return (
		normalizedTarget === normalizedDirectory ||
		normalizedTarget.startsWith(`${normalizedDirectory}${Path.sep}`)
	);
}

function replacePathPrefix(filePath: string, oldPrefix: string, newPrefix: string): string {
	const normalizedPath = Path.normalize(filePath);
	const normalizedOldPrefix = Path.normalize(oldPrefix);
	const normalizedNewPrefix = Path.normalize(newPrefix);

	if (normalizedPath === normalizedOldPrefix) {
		return normalizedNewPrefix;
	}

	if (!normalizedPath.startsWith(`${normalizedOldPrefix}${Path.sep}`)) {
		return normalizedPath;
	}

	return `${normalizedNewPrefix}${normalizedPath.slice(normalizedOldPrefix.length)}`;
}

function createDirectoryNode(
	path: string,
	parentPath: string | null,
	depth: number,
	overrides: Partial<TreeNode> = {},
): TreeNode {
	return {
		path,
		name: getBaseName(path),
		kind: "directory",
		mimeType: null,
		size: null,
		mtimeMs: null,
		hasChildren: false,
		parentPath,
		depth,
		children: [],
		isLoaded: false,
		isLoading: false,
		isExpanded: false,
		...overrides,
	};
}

function removeBranch(nodes: Record<string, TreeNode>, path: string): void {
	const node = nodes[path];
	if (!node) {
		return;
	}

	for (const childPath of node.children) {
		removeBranch(nodes, childPath);
	}

	delete nodes[path];
}

function remapBranch(
	nodes: Record<string, TreeNode>,
	oldPath: string,
	newPath: string,
): Record<string, TreeNode> {
	const normalizedOldPath = Path.normalize(oldPath);
	const normalizedNewPath = Path.normalize(newPath);
	const nextNodes = { ...nodes };
	const branchPaths = Object.keys(nodes)
		.filter((candidatePath) => isPathInsideDirectory(normalizedOldPath, candidatePath))
		.sort((left, right) => left.length - right.length);

	for (const branchPath of branchPaths) {
		const currentNode = nextNodes[branchPath];
		if (!currentNode) {
			continue;
		}

		const mappedPath = replacePathPrefix(branchPath, normalizedOldPath, normalizedNewPath);
		nextNodes[mappedPath] = {
			...currentNode,
			path: mappedPath,
			name: mappedPath === normalizedNewPath ? getBaseName(mappedPath) : currentNode.name,
			parentPath: currentNode.parentPath
				? replacePathPrefix(currentNode.parentPath, normalizedOldPath, normalizedNewPath)
				: currentNode.parentPath,
			children: currentNode.children.map((childPath) =>
				replacePathPrefix(childPath, normalizedOldPath, normalizedNewPath),
			),
		};

		if (mappedPath !== branchPath) {
			delete nextNodes[branchPath];
		}
	}

	return nextNodes;
}

function updateSelectionPaths(paths: string[], oldPath: string, newPath: string): string[] {
	return paths.map((path) => replacePathPrefix(path, oldPath, newPath));
}

export function treeRecordToItems(
	nodes: Record<string, TreeNode>,
	rootPath: string,
): TreeItem[] {
	const root = nodes[rootPath];
	if (!root || !root.isExpanded) {
		return [];
	}

	function build(path: string): TreeItem | null {
		const node = nodes[path];
		if (!node) {
			return null;
		}

		const item: TreeItem = {
			id: node.path,
			name: node.name,
			metadata: node.metadata ?? node.customization,
		};

		if (node.kind === "directory") {
			item.children = node.isExpanded
				? node.children
					.map((childPath) => build(childPath))
					.filter((child): child is TreeItem => child !== null)
				: [];
		}

		return item;
	}

	return root.children
		.map((childPath) => build(childPath))
		.filter((child): child is TreeItem => child !== null);
}

function resolveFileTreeNode(
	nodes: Record<string, TreeNode>,
	path: string,
): FileTreeNode | null {
	const node = nodes[path];
	if (!node) {
		return null;
	}

	const children = node.children
		.map((childPath) => resolveFileTreeNode(nodes, childPath))
		.filter((child): child is FileTreeNode => child !== null);

	return {
		...node,
		children,
	};
}

export function useFileTree(options?: UseFileTreeOptions) {
	const optionsRef = useRef(options);
	const stateRef = useRef<TreeState>({
		rootPath: null,
		nodes: {},
		selectedPaths: [],
		focusedPath: null,
		lastSelectedPath: null,
	});
	const rootLoadTokenRef = useRef(0);
	const inflightLoadsRef = useRef(new Map<string, Promise<DirEntry[]>>());
	const [state, setState] = useState<TreeState>(stateRef.current);

	useEffect(() => {
		optionsRef.current = options;
	}, [options]);

	const setTreeState = useCallback(
		(updater: TreeState | ((previous: TreeState) => TreeState)) => {
			const nextState =
				typeof updater === "function"
					? (updater as (previous: TreeState) => TreeState)(stateRef.current)
					: updater;

			stateRef.current = nextState;
			setState(nextState);
		},
		[],
	);

	const assertPathWithinRoot = useCallback((targetPath: string): string => {
		const rootPath = stateRef.current.rootPath;
		const normalizedTargetPath = Path.normalize(targetPath);

		if (!rootPath) {
			throw new Error("A rootPath must be opened before performing file tree operations.");
		}

		if (!isPathWithinRoot(rootPath, normalizedTargetPath)) {
			throw new Error(`Path "${normalizedTargetPath}" is outside the current rootPath.`);
		}

		return normalizedTargetPath;
	}, []);

	const readDirectory = useCallback(async (dirPath: string) => {
		return main.readDirectory(dirPath, {
			includeHidden: optionsRef.current?.includeHidden ?? false,
		});
	}, []);

	const mergeDirectory = useCallback(
		(parentPath: string, entries: DirEntry[]) => {
			setTreeState((previous) => {
				const parentNode = previous.nodes[parentPath];
				const parentDepth = parentNode?.depth ?? 0;
				const nextNodes = { ...previous.nodes };
				const nextChildPaths = entries.map((entry) => entry.path);
				const currentChildPaths = nextNodes[parentPath]?.children ?? [];
				const nextChildPathSet = new Set(nextChildPaths);

				for (const removedChildPath of currentChildPaths) {
					if (!nextChildPathSet.has(removedChildPath)) {
						removeBranch(nextNodes, removedChildPath);
					}
				}

				for (const entry of entries) {
					const existingNode = nextNodes[entry.path];

					nextNodes[entry.path] = {
						...existingNode,
						...entry,
						parentPath,
						depth: parentDepth + 1,
						children:
							entry.kind === "directory"
								? existingNode?.children ?? []
								: [],
						isLoaded:
							entry.kind === "directory"
								? existingNode?.isLoaded ?? false
								: true,
						isLoading: false,
						isExpanded: existingNode?.isExpanded ?? false,
						customization: existingNode?.customization,
					};
				}

				nextNodes[parentPath] = createDirectoryNode(
					parentPath,
					parentNode?.parentPath ?? null,
					parentDepth,
					{
						...parentNode,
						path: parentPath,
						name: parentNode?.name ?? getBaseName(parentPath),
						hasChildren: entries.length > 0,
						children: nextChildPaths,
						isLoaded: true,
						isLoading: false,
					},
				);

				return {
					...previous,
					nodes: nextNodes,
				};
			});
		},
		[setTreeState],
	);

	const loadDirectory = useCallback(
		async (directoryPath: string, force = false): Promise<DirEntry[]> => {
			const normalizedDirectoryPath = assertPathWithinRoot(directoryPath);
			const currentRootPath = stateRef.current.rootPath;
			const currentLoadToken = rootLoadTokenRef.current;
			const currentNode = stateRef.current.nodes[normalizedDirectoryPath];

			if (currentNode?.kind && currentNode.kind !== "directory") {
				throw new Error(`Path "${normalizedDirectoryPath}" is not a directory.`);
			}

			if (!force && currentNode?.isLoaded) {
				return currentNode.children
					.map((childPath) => stateRef.current.nodes[childPath])
					.filter((entry): entry is TreeNode => Boolean(entry));
			}

			const existingLoad = inflightLoadsRef.current.get(normalizedDirectoryPath);
			if (existingLoad) {
				return existingLoad;
			}

			setTreeState((previous) => {
				const previousNode = previous.nodes[normalizedDirectoryPath];
				const parentPath = previousNode?.parentPath ?? (normalizedDirectoryPath === currentRootPath ? null : getParentPath(normalizedDirectoryPath));
				const depth = previousNode?.depth ?? (parentPath ? (previous.nodes[parentPath]?.depth ?? -1) + 1 : 0);

				return {
					...previous,
					nodes: {
						...previous.nodes,
						[normalizedDirectoryPath]: createDirectoryNode(
							normalizedDirectoryPath,
							parentPath,
							depth,
							{
								...previousNode,
								isLoading: true,
							},
						),
					},
				};
			});

			const loadPromise = (async () => {
				try {
					const entries = await readDirectory(normalizedDirectoryPath);

					if (
						rootLoadTokenRef.current !== currentLoadToken ||
						stateRef.current.rootPath !== currentRootPath
					) {
						return entries;
					}

					mergeDirectory(normalizedDirectoryPath, entries);
					return entries;
				} finally {
					inflightLoadsRef.current.delete(normalizedDirectoryPath);

					if (
						rootLoadTokenRef.current === currentLoadToken &&
						stateRef.current.rootPath === currentRootPath
					) {
						setTreeState((previous) => {
							const targetNode = previous.nodes[normalizedDirectoryPath];
							if (!targetNode) {
								return previous;
							}

							return {
								...previous,
								nodes: {
									...previous.nodes,
									[normalizedDirectoryPath]: {
										...targetNode,
										isLoading: false,
									},
								},
							};
						});
					}
				}
			})();

			inflightLoadsRef.current.set(normalizedDirectoryPath, loadPromise);
			return loadPromise;
		},
		[assertPathWithinRoot, mergeDirectory, readDirectory, setTreeState],
	);

	const loadExpandedLayer = useCallback(
		async (directoryPath: string, force = false) => {
			const entries = await loadDirectory(directoryPath, force);
			const childDirectories = entries.filter((entry) => entry.kind === "directory");

			await Promise.all(
				childDirectories.map((entry) => loadDirectory(entry.path, force)),
			);
		},
		[loadDirectory],
	);

	const getCreateParentPath = useCallback((): string | null => {
		const currentState = stateRef.current;
		const targetPath = currentState.focusedPath ?? currentState.selectedPaths[0];

		if (!targetPath) {
			return currentState.rootPath;
		}

		const targetNode = currentState.nodes[targetPath];
		if (!targetNode) {
			return currentState.rootPath;
		}

		return targetNode.kind === "directory"
			? targetNode.path
			: targetNode.parentPath;
	}, []);

	const select = useCallback((path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => ({
			...previous,
			selectedPaths: [normalizedPath],
			focusedPath: normalizedPath,
			lastSelectedPath: normalizedPath,
		}));
	}, [assertPathWithinRoot, setTreeState]);

	const toggleSelect = useCallback((path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => {
			const isSelected = previous.selectedPaths.includes(normalizedPath);

			return {
				...previous,
				selectedPaths: isSelected
					? previous.selectedPaths.filter((candidatePath) => candidatePath !== normalizedPath)
					: [...previous.selectedPaths, normalizedPath],
				focusedPath: normalizedPath,
				lastSelectedPath: normalizedPath,
			};
		});
	}, [assertPathWithinRoot, setTreeState]);

	const clearSelection = useCallback(() => {
		setTreeState((previous) => ({
			...previous,
			selectedPaths: [],
			focusedPath: null,
			lastSelectedPath: null,
		}));
	}, [setTreeState]);

	const ensureSelected = useCallback((path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => {
			if (previous.selectedPaths.includes(normalizedPath)) {
				return {
					...previous,
					focusedPath: normalizedPath,
				};
			}

			return {
				...previous,
				selectedPaths: [normalizedPath],
				focusedPath: normalizedPath,
				lastSelectedPath: normalizedPath,
			};
		});
	}, [assertPathWithinRoot, setTreeState]);

	const isSelected = useCallback((path: string) => {
		const normalizedPath = Path.normalize(path);
		return stateRef.current.selectedPaths.includes(normalizedPath);
	}, []);

	const openRoot = useCallback(async (rootPath: string) => {
		const normalizedRootPath = Path.normalize(rootPath);
		const rootNode = createDirectoryNode(normalizedRootPath, null, 0, {
			name: getBaseName(normalizedRootPath),
			isExpanded: true,
			isLoading: true,
		});

		rootLoadTokenRef.current += 1;
		inflightLoadsRef.current.clear();

		setTreeState({
			rootPath: normalizedRootPath,
			nodes: {
				[normalizedRootPath]: rootNode,
			},
			focusedPath: normalizedRootPath,
			lastSelectedPath: normalizedRootPath,
			selectedPaths: [normalizedRootPath],
		});

		await loadExpandedLayer(normalizedRootPath, true);
	}, [loadExpandedLayer, setTreeState]);

	const expand = useCallback(async (path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => {
			const targetNode = previous.nodes[normalizedPath];
			if (!targetNode || targetNode.kind !== "directory") {
				return previous;
			}

			return {
				...previous,
				nodes: {
					...previous.nodes,
					[normalizedPath]: {
						...targetNode,
						isExpanded: true,
					},
				},
			};
		});

		await loadExpandedLayer(normalizedPath);
	}, [assertPathWithinRoot, loadExpandedLayer, setTreeState]);

	const collapse = useCallback((path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => {
			const targetNode = previous.nodes[normalizedPath];
			if (!targetNode || targetNode.kind !== "directory") {
				return previous;
			}

			return {
				...previous,
				nodes: {
					...previous.nodes,
					[normalizedPath]: {
						...targetNode,
						isExpanded: false,
					},
				},
			};
		});
	}, [assertPathWithinRoot, setTreeState]);

	const toggle = useCallback(async (path: string) => {
		const normalizedPath = assertPathWithinRoot(path);
		const node = stateRef.current.nodes[normalizedPath];
		if (!node || node.kind !== "directory") {
			return;
		}

		if (node.isExpanded) {
			collapse(normalizedPath);
			return;
		}

		await expand(normalizedPath);
	}, [assertPathWithinRoot, collapse, expand]);

	const refreshDirectory = useCallback(async (dirPath: string) => {
		const normalizedDirectoryPath = assertPathWithinRoot(dirPath);
		const node = stateRef.current.nodes[normalizedDirectoryPath];

		if (node?.isExpanded) {
			await loadExpandedLayer(normalizedDirectoryPath, true);
			return;
		}

		await loadDirectory(normalizedDirectoryPath, true);
	}, [assertPathWithinRoot, loadDirectory, loadExpandedLayer]);

	const setNodeCustomization = useCallback(
		(path: string, customization: NodeCustomization) => {
			const normalizedPath = assertPathWithinRoot(path);

			setTreeState((previous) => {
				const targetNode = previous.nodes[normalizedPath];
				if (!targetNode) {
					return previous;
				}

				return {
					...previous,
					nodes: {
						...previous.nodes,
						[normalizedPath]: {
							...targetNode,
							customization: {
								...targetNode.customization,
								...customization,
							},
						},
					},
				};
			});
		},
		[assertPathWithinRoot, setTreeState],
	);

	const clearNodeCustomization = useCallback((path: string) => {
		const normalizedPath = assertPathWithinRoot(path);

		setTreeState((previous) => {
			const targetNode = previous.nodes[normalizedPath];
			if (!targetNode) {
				return previous;
			}

			return {
				...previous,
				nodes: {
					...previous.nodes,
					[normalizedPath]: {
						...targetNode,
						customization: undefined,
					},
				},
			};
		});
	}, [assertPathWithinRoot, setTreeState]);

	const isBinaryFile = useCallback(async (path: string): Promise<boolean> => {
		const normalizedPath = assertPathWithinRoot(path);
		return main.isBinaryFile(normalizedPath);
	}, [assertPathWithinRoot]);

	const readFile = useCallback(async (path: string, encoding?:BufferEncoding) => {
		const parentPath = getCreateParentPath();
		if (!parentPath) {
			throw new Error("No parent directory is available for file read.");
		}

		const fullPath = assertPathWithinRoot(path);

		setTreeState((previous) => ({
			...previous,
			selectedPaths: [fullPath],
			focusedPath: fullPath,
			lastSelectedPath: fullPath,
		}));

		return main.readFile(fullPath, encoding);
	}, [assertPathWithinRoot, getCreateParentPath, refreshDirectory, setTreeState]);

	const writeFile = useCallback(async (path: string, content: string, encoding?:BufferEncoding) => {
		const parentPath = getCreateParentPath();
		if (!parentPath) {
			throw new Error("No parent directory is available for file write.");
		}

		const fullPath = assertPathWithinRoot(path);
		await main.writeFile(fullPath, content, encoding);
		await refreshDirectory(parentPath);

		setTreeState((previous) => ({
			...previous,
			selectedPaths: [fullPath],
			focusedPath: fullPath,
			lastSelectedPath: fullPath,
		}));
	}, [assertPathWithinRoot, getCreateParentPath, refreshDirectory, setTreeState]);

	const createFile = useCallback(async (name: string) => {
		const parentPath = getCreateParentPath();
		if (!parentPath) {
			throw new Error("No parent directory is available for file creation.");
		}

		const fullPath = assertPathWithinRoot(joinPath(parentPath, name));
		await main.createFile(fullPath);
		await refreshDirectory(parentPath);

		setTreeState((previous) => ({
			...previous,
			selectedPaths: [fullPath],
			focusedPath: fullPath,
			lastSelectedPath: fullPath,
		}));
	}, [assertPathWithinRoot, getCreateParentPath, refreshDirectory, setTreeState]);

	const createDirectory = useCallback(async (name: string) => {
		const parentPath = getCreateParentPath();
		if (!parentPath) {
			throw new Error("No parent directory is available for folder creation.");
		}

		const fullPath = assertPathWithinRoot(joinPath(parentPath, name));
		await main.createDirectory(fullPath);
		await refreshDirectory(parentPath);

		setTreeState((previous) => ({
			...previous,
			selectedPaths: [fullPath],
			focusedPath: fullPath,
			lastSelectedPath: fullPath,
		}));
	}, [assertPathWithinRoot, getCreateParentPath, refreshDirectory, setTreeState]);

	const applyPathMove = useCallback(
		async (oldPath: string, newPath: string) => {
			const normalizedOldPath = assertPathWithinRoot(oldPath);
			const normalizedNewPath = assertPathWithinRoot(newPath);
			const rootPath = stateRef.current.rootPath;

			if (!rootPath) {
				throw new Error("A rootPath must be opened before moving files.");
			}

			if (normalizedOldPath === rootPath) {
				throw new Error("The current rootPath cannot be moved or renamed from this hook.");
			}

			const sourceNode = stateRef.current.nodes[normalizedOldPath];
			if (
				sourceNode?.kind === "directory" &&
				isPathInsideDirectory(normalizedOldPath, normalizedNewPath)
			) {
				throw new Error("A directory cannot be moved into itself.");
			}

			const oldParentPath = getParentPath(normalizedOldPath);
			const newParentPath = getParentPath(normalizedNewPath);

			await main.rename(normalizedOldPath, normalizedNewPath);

			setTreeState((previous) => ({
				...previous,
				nodes: remapBranch(previous.nodes, normalizedOldPath, normalizedNewPath),
				selectedPaths: updateSelectionPaths(
					previous.selectedPaths,
					normalizedOldPath,
					normalizedNewPath,
				),
				focusedPath: previous.focusedPath
					? replacePathPrefix(previous.focusedPath, normalizedOldPath, normalizedNewPath)
					: null,
				lastSelectedPath: previous.lastSelectedPath
					? replacePathPrefix(
						previous.lastSelectedPath,
						normalizedOldPath,
						normalizedNewPath,
					)
					: null,
			}));

			await refreshDirectory(oldParentPath);

			if (newParentPath !== oldParentPath) {
				await refreshDirectory(newParentPath);
			}

			if (sourceNode?.kind === "directory") {
				if (sourceNode.isExpanded) {
					await loadExpandedLayer(normalizedNewPath, true);
				} else if (sourceNode.isLoaded) {
					await loadDirectory(normalizedNewPath, true);
				}
			}
		},
		[
			assertPathWithinRoot,
			loadDirectory,
			loadExpandedLayer,
			refreshDirectory,
			setTreeState,
		],
	);

	const rename = useCallback(async (oldPath: string, newName: string) => {
		const normalizedOldPath = assertPathWithinRoot(oldPath);
		const parentPath = getParentPath(normalizedOldPath);
		const newPath = joinPath(parentPath, newName);

		await applyPathMove(normalizedOldPath, newPath);
	}, [applyPathMove, assertPathWithinRoot]);

	const move = useCallback(async (sourcePath: string, destinationPath: string) => {
		const normalizedSourcePath = assertPathWithinRoot(sourcePath);
		const normalizedDestinationPath = assertPathWithinRoot(destinationPath);
		const sourceNode = stateRef.current.nodes[normalizedSourcePath];
		const destinationNode = stateRef.current.nodes[normalizedDestinationPath];

		const targetPath =
			destinationNode?.kind === "directory"
				? joinPath(normalizedDestinationPath, sourceNode?.name ?? getBaseName(normalizedSourcePath))
				: normalizedDestinationPath;

		await applyPathMove(normalizedSourcePath, targetPath);
	}, [applyPathMove, assertPathWithinRoot]);

	const remove = useCallback(async (path: string) => {
		const normalizedPath = assertPathWithinRoot(path);
		const rootPath = stateRef.current.rootPath;

		if (!rootPath) {
			throw new Error("A rootPath must be opened before deleting files.");
		}

		if (normalizedPath === rootPath) {
			throw new Error("The current rootPath cannot be deleted from this hook.");
		}

		const parentPath = getParentPath(normalizedPath);
		await main.delete(normalizedPath);

		setTreeState((previous) => {
			const nextNodes = { ...previous.nodes };
			removeBranch(nextNodes, normalizedPath);

			return {
				...previous,
				nodes: nextNodes,
				selectedPaths: previous.selectedPaths.filter(
					(candidatePath) => !isPathInsideDirectory(normalizedPath, candidatePath),
				),
				focusedPath:
					previous.focusedPath && isPathInsideDirectory(normalizedPath, previous.focusedPath)
						? null
						: previous.focusedPath,
				lastSelectedPath:
					previous.lastSelectedPath &&
						isPathInsideDirectory(normalizedPath, previous.lastSelectedPath)
						? null
						: previous.lastSelectedPath,
			};
		});

		await refreshDirectory(parentPath);
	}, [assertPathWithinRoot, refreshDirectory, setTreeState]);

	const getNode = useCallback((path: string) => {
		const normalizedPath = Path.normalize(path);
		return stateRef.current.nodes[normalizedPath];
	}, []);

	const getChildren = useCallback((path: string) => {
		const normalizedPath = Path.normalize(path);
		const node = stateRef.current.nodes[normalizedPath];
		if (!node) {
			return [];
		}

		return node.children
			.map((childPath) => stateRef.current.nodes[childPath])
			.filter((child): child is TreeNode => Boolean(child));
	}, []);

	const selectedNodes = useMemo(() => {
		return state.selectedPaths
			.map((path) => state.nodes[path])
			.filter((node): node is TreeNode => Boolean(node));
	}, [state.nodes, state.selectedPaths]);

	const rootNode = useMemo(() => {
		if (!state.rootPath) {
			return null;
		}

		return resolveFileTreeNode(state.nodes, state.rootPath);
	}, [state.nodes, state.rootPath]);

	const treeNodes = rootNode?.children ?? [];

	return useMemo(() => ({
		rootPath: state.rootPath,
		nodes: state.nodes,
		rootNode,
		treeNodes,
		focusedPath: state.focusedPath,
		selectedPaths: state.selectedPaths,

		openRoot,
		expand,
		collapse,
		toggle,
		refreshDirectory,

		isBinaryFile,
		readFile,
		writeFile,
		createFile,
		createDirectory,
		move,
		rename,
		remove,
		delete: remove,

		setNodeCustomization,
		clearNodeCustomization,

		getNode,
		getChildren,
		selectedNodes,

		select,
		toggleSelect,
		clearSelection,
		ensureSelected,
		isSelected,
	}), [
		clearNodeCustomization,
		clearSelection,
		collapse,
		createDirectory,
		createFile,
		readFile,
		writeFile,
		isBinaryFile,
		ensureSelected,
		expand,
		getChildren,
		getNode,
		isSelected,
		move,
		openRoot,
		refreshDirectory,
		remove,
		rename,
		rootNode,
		select,
		selectedNodes,
		setNodeCustomization,
		state.focusedPath,
		state.nodes,
		state.rootPath,
		state.selectedPaths,
		toggle,
		toggleSelect,
		treeNodes,
	]);
}

export type Tree = ReturnType<typeof useFileTree>;
