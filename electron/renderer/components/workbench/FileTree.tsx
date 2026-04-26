import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { InputModal, useInputModalController } from '@/renderer/components/workbench/InputModal';
import { TreeNode } from '@/renderer/hooks/useTree';
import { getCachedLabel, requestLabel, subscribeAllLabels } from '@/renderer/hooks/useFileLabel';
import {
	Tree,
	TreeMenuItem,
	TreeMenuSeparator,
	type TreeContextMenuContext,
	type TreeDragAndDropProps,
	type TreeHandle,
	type TreeRenamingProps,
} from '@/renderer/components/tree';

const TREE_SEP = '/';

function toRelative(rootPath: string, absPath: string): string {
	if (absPath === rootPath) return '';
	const root = rootPath.replace(/[\\/]+$/, '');
	if (absPath.startsWith(root + '/')) return absPath.slice(root.length + 1);
	if (absPath.startsWith(root + '\\')) return absPath.slice(root.length + 1).split('\\').join('/');
	return absPath.split('\\').join('/');
}

function joinAbs(rootPath: string, rel: string): string {
	const cleanRel = rel.replace(/[\\/]+$/, '');
	if (!cleanRel) return rootPath;
	const root = rootPath.replace(/[\\/]+$/, '');
	return `${root}${TREE_SEP}${cleanRel}`;
}

function buildPaths(nodes: Record<string, TreeNode>, rootPath: string): string[] {
	const root = nodes[rootPath];
	if (!root) return [];
	const out: string[] = [];
	const visit = (childPaths: readonly string[]) => {
		for (const path of childPaths) {
			const node = nodes[path];
			if (!node) continue;
			const rel = toRelative(rootPath, node.path);
			if (!rel) continue;
			if (node.kind === 'directory') {
				out.push(rel + TREE_SEP);
				visit(node.children);
			} else {
				out.push(rel);
			}
		}
	};
	visit(root.children);
	return out;
}

export function FileTree() {
	const { fs, workspace, treeRef } = useWorkbench();
	const inputController = useInputModalController();
	const { nodes, rootPath } = fs;

	const fsRef = useRef(fs);
	fsRef.current = fs;
	const workspaceRef = useRef(workspace);
	workspaceRef.current = workspace;

	const paths = useMemo(() => {
		if (!rootPath) return [];
		return buildPaths(nodes, rootPath);
	}, [nodes, rootPath]);

	const rootPathRef = useRef(rootPath);
	rootPathRef.current = rootPath;

	const relToAbs = useCallback((rel: string): string => {
		const root = rootPathRef.current;
		if (!root) return rel;
		return joinAbs(root, rel);
	}, []);

	const treeHandleRef = useRef<TreeHandle | null>(null);

	// Expose imperative tree to the workbench for programmatic focus/expand.
	useEffect(() => {
		treeRef.current = treeHandleRef.current;
	});

	// Preserve expansion across `paths` resets.
	const prevPathsRef = useRef<readonly string[]>(paths);
	useEffect(() => {
		const prev = prevPathsRef.current;
		if (prev === paths) return;
		if (prev.length === paths.length) {
			let same = true;
			for (let i = 0; i < paths.length; i++) {
				if (prev[i] !== paths[i]) { same = false; break; }
			}
			if (same) {
				prevPathsRef.current = paths;
				return;
			}
		}
		const handle = treeHandleRef.current;
		if (handle) {
			const expanded = handle.getExpandedPaths().filter((p) => paths.includes(p));
			handle.setExpansion(expanded);
		}
		prevPathsRef.current = paths;
	}, [paths]);

	// Force a re-render when an AI label arrives so renderPrimary picks it up.
	const [, bumpLabels] = useReducer((x: number) => x + 1, 0);
	useEffect(() => {
		let frame: number | null = null;
		const trigger = () => {
			if (frame != null) return;
			frame = window.requestAnimationFrame(() => {
				frame = null;
				bumpLabels();
			});
		};
		const unsub = subscribeAllLabels(trigger);
		return () => {
			unsub();
			if (frame != null) window.cancelAnimationFrame(frame);
		};
	}, []);

	const expandedRef = useRef<ReadonlySet<string>>(new Set());
	const handleExpansionChange = useCallback((expanded: ReadonlySet<string>) => {
		const prev = expandedRef.current;
		const root = rootPathRef.current;
		if (root) {
			for (const rel of expanded) {
				if (prev.has(rel)) continue;
				const abs = joinAbs(root, rel);
				if (abs === root) continue;
				Promise.resolve(fsRef.current.expand(abs)).catch((err) => {
					console.warn('[FileTree] expand failed', abs, err);
				});
			}
			for (const rel of prev) {
				if (expanded.has(rel)) continue;
				const abs = joinAbs(root, rel);
				if (abs === root) continue;
				try {
					fsRef.current.collapse?.(abs);
				} catch (err) {
					console.warn('[FileTree] collapse failed', abs, err);
				}
			}
		}
		expandedRef.current = expanded;
	}, []);

	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	const handleSelect = useCallback((rel: string) => {
		setSelectedPath(rel);
		const abs = relToAbs(rel);
		fsRef.current.select(abs);
		// Match the previous @pierre/trees behavior: a single click on a file
		// opens it in the editor. Folders just toggle (handled by Tree).
		if (!rel.endsWith('/')) {
			workspaceRef.current.openInEditor(abs);
		}
	}, [relToAbs]);

	const handleActivate = useCallback((rel: string) => {
		if (rel.endsWith('/')) return;
		const abs = relToAbs(rel);
		setSelectedPath(rel);
		fsRef.current.select(abs);
		workspaceRef.current.openInEditor(abs);
	}, [relToAbs]);

	const renderPrimary = useCallback(
		(ctx: { path: string; name: string; kind: 'file' | 'folder' }) => {
			if (ctx.kind !== 'file') return null;
			const root = rootPathRef.current;
			if (!root) return null;
			const abs = joinAbs(root, ctx.path);
			const entry = getCachedLabel(abs);
			if (entry && entry !== 'pending') {
				return <span title={entry.label}>{entry.label}</span>;
			}
			requestLabel(abs, false);
			return null;
		},
		[],
	);

	const renderIcon = useCallback(
		(ctx: { path: string; kind: 'file' | 'folder' }) => {
			if (ctx.kind !== 'file') return null;
			const root = rootPathRef.current;
			if (!root) return null;
			const abs = joinAbs(root, ctx.path);
			const entry = getCachedLabel(abs);
			if (entry && entry !== 'pending' && entry.emoji) {
				return (
					<span aria-hidden className="text-[14px] leading-none">
						{entry.emoji}
					</span>
				);
			}
			return null;
		},
		[],
	);

	const basenameOfRel = useCallback((rel: string): string => {
		const cleaned = rel.endsWith('/') ? rel.slice(0, -1) : rel;
		const idx = cleaned.lastIndexOf('/');
		return idx === -1 ? cleaned : cleaned.slice(idx + 1);
	}, []);

	const renamingProps = useMemo<TreeRenamingProps>(() => ({
		onRename: async ({ sourcePath, destinationPath, isDirectory }) => {
			const newName = basenameOfRel(destinationPath);
			const srcAbs = relToAbs(sourcePath);
			void isDirectory;
			await fsRef.current.rename(srcAbs, newName);
		},
		onError: (err) => {
			toast.error(err.message || 'Unable to rename item.');
		},
	}), [basenameOfRel, relToAbs]);

	const dragAndDropProps = useMemo<TreeDragAndDropProps>(() => ({
		onDrop: async ({ draggedPaths, targetPath }) => {
			const root = rootPathRef.current;
			if (!root) return;
			const destDirAbs = targetPath == null ? root : relToAbs(targetPath);
			for (const src of draggedPaths) {
				const srcAbs = relToAbs(src);
				const node = fsRef.current.getNode(srcAbs);
				if (!node) continue;
				if (node.parentPath === destDirAbs) continue;
				// Prevent moving a directory into itself or a descendant.
				if (node.kind === 'directory' && (destDirAbs === srcAbs || destDirAbs.startsWith(srcAbs + '/'))) {
					continue;
				}
				await fsRef.current.move(srcAbs, destDirAbs);
			}
		},
		canDrop: ({ draggedPaths, targetPath }) => {
			// Disallow dropping into self / descendant for folder drags.
			for (const src of draggedPaths) {
				if (!src.endsWith('/')) continue;
				if (targetPath == null) continue;
				if (targetPath === src) return false;
				if (targetPath.startsWith(src)) return false;
			}
			return true;
		},
		onError: (err) => {
			toast.error(err.message || 'Unable to move item.');
		},
	}), [relToAbs]);

	const promptCreateFile = useCallback(async (parentRel: string | null) => {
		const root = rootPathRef.current;
		if (!root) return;
		const parentAbs = parentRel == null ? root : relToAbs(parentRel);
		const name = await inputController.prompt({
			title: 'New file',
			message: 'Enter a name for the new file:',
			messagePlaceholder: 'untitled.txt',
			confirmText: 'Create',
		});
		if (name === null) return;
		const trimmed = name.trim();
		if (!trimmed) {
			toast.error('Name cannot be empty.');
			return;
		}
		try {
			fsRef.current.select(parentAbs);
			await fsRef.current.createFile(trimmed);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Unable to create file.');
		}
	}, [inputController, relToAbs]);

	const promptCreateFolder = useCallback(async (parentRel: string | null) => {
		const root = rootPathRef.current;
		if (!root) return;
		const parentAbs = parentRel == null ? root : relToAbs(parentRel);
		const name = await inputController.prompt({
			title: 'New folder',
			message: 'Enter a name for the new folder:',
			messagePlaceholder: 'untitled folder',
			confirmText: 'Create',
		});
		if (name === null) return;
		const trimmed = name.trim();
		if (!trimmed) {
			toast.error('Name cannot be empty.');
			return;
		}
		try {
			fsRef.current.select(parentAbs);
			await fsRef.current.createDirectory(trimmed);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Unable to create folder.');
		}
	}, [inputController, relToAbs]);

	const promptDelete = useCallback(async (rel: string) => {
		const abs = relToAbs(rel);
		const name = basenameOfRel(rel);
		const confirm = await inputController.prompt({
			title: 'Delete',
			message: `Type "${name}" to confirm deletion. This cannot be undone.`,
			messagePlaceholder: name,
			confirmText: 'Delete',
		});
		if (confirm === null) return;
		if (confirm.trim() !== name) {
			toast.error('Name did not match. Deletion cancelled.');
			return;
		}
		try {
			await fsRef.current.remove(abs);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Unable to delete item.');
		}
	}, [basenameOfRel, inputController, relToAbs]);

	const renderContextMenu = useCallback((ctx: TreeContextMenuContext) => {
		if (ctx.kind === 'root') {
			return (
				<>
					<TreeMenuItem onSelect={() => { void promptCreateFile(null); }}>
						New file
					</TreeMenuItem>
					<TreeMenuItem onSelect={() => { void promptCreateFolder(null); }}>
						New folder
					</TreeMenuItem>
				</>
			);
		}
		const path = ctx.path!;
		const isFolder = ctx.kind === 'folder';
		const parentRelForCreate = isFolder ? path : (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : null);
		return (
			<>
				<TreeMenuItem onSelect={() => { void promptCreateFile(parentRelForCreate); }}>
					New file
				</TreeMenuItem>
				{isFolder && (
					<TreeMenuItem onSelect={() => { void promptCreateFolder(parentRelForCreate); }}>
						New folder
					</TreeMenuItem>
				)}
				<TreeMenuSeparator />
				<TreeMenuItem
					onSelect={() => {
						const handle = treeHandleRef.current;
						if (!handle) return;
						requestAnimationFrame(() => {
							handle.startRenaming(path);
						});
					}}
				>
					Rename
				</TreeMenuItem>
				<TreeMenuItem variant="destructive" onSelect={() => { void promptDelete(path); }}>
					Delete
				</TreeMenuItem>
			</>
		);
	}, [promptCreateFile, promptCreateFolder, promptDelete]);

	return (
		<>
			<Tree
				paths={paths}
				initialExpansion="closed"
				selectedPath={selectedPath}
				onSelect={handleSelect}
				onActivate={handleActivate}
				onExpansionChange={handleExpansionChange}
				renderPrimary={renderPrimary}
				renderIcon={renderIcon}
				renaming={renamingProps}
				dragAndDrop={dragAndDropProps}
				renderContextMenu={renderContextMenu}
				modelRef={treeHandleRef}
				aria-label="Files"
				style={{ minHeight: 320 }}
			/>
			<InputModal controller={inputController} />
		</>
	);
}
