import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import type {
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
	FileTreeDropResult,
	FileTreeRenameEvent,
	FileTreeRowDecoration,
	FileTreeRowDecorationContext,
} from '@pierre/trees';
import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { InputModal, useInputModalController } from '@/renderer/components/workbench/InputModal';
import { TreeNode } from '@/renderer/hooks/useTree';
import { getCachedLabel, requestLabel, subscribeAllLabels } from '@/renderer/hooks/useFileLabel';
import { toast } from 'sonner';
import { cn } from '@/shared/utils';

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

function basename(p: string): string {
	const cleaned = p.replace(/[\\/]+$/, '');
	const idx = cleaned.lastIndexOf('/');
	return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

function dirname(p: string): string {
	const cleaned = p.replace(/[\\/]+$/, '');
	const idx = cleaned.lastIndexOf('/');
	return idx === -1 ? '' : cleaned.slice(0, idx);
}

function buildPaths(nodes: Record<string, TreeNode>, rootPath: string): string[] {
	const root = nodes[rootPath];
	if (!root) return [];
	const out: string[] = [];
	const stack: string[] = [...root.children];
	while (stack.length) {
		const path = stack.shift()!;
		const node = nodes[path];
		if (!node) continue;
		const rel = toRelative(rootPath, node.path);
		if (!rel) continue;
		if (node.kind === 'directory') {
			out.push(rel + TREE_SEP);
			for (const child of node.children) stack.push(child);
		} else {
			out.push(rel);
		}
	}
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
	const inputControllerRef = useRef(inputController);
	inputControllerRef.current = inputController;

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

	const handleRename = useCallback(async (event: FileTreeRenameEvent) => {
		const root = rootPathRef.current;
		if (!root) return;
		const newName = basename(event.destinationPath).trim();
		if (!newName) {
			toast.error('Name cannot be empty.');
			return;
		}
		try {
			await fsRef.current.rename(relToAbs(event.sourcePath), newName);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to rename item.');
		}
	}, [relToAbs]);

	const handleDrop = useCallback(async (event: FileTreeDropResult) => {
		const root = rootPathRef.current;
		if (!root) return;
		const destDirRel = event.target.directoryPath;
		const destDirAbs = destDirRel == null ? root : relToAbs(destDirRel);
		try {
			for (const dragged of event.draggedPaths) {
				const srcAbs = relToAbs(dragged);
				const srcNode = fsRef.current.getNode(srcAbs);
				if (srcNode && srcNode.parentPath === destDirAbs) continue;
				await fsRef.current.move(srcAbs, destDirAbs);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to move item.');
		}
	}, [relToAbs]);

	const [selectedPaths, setSelectedPaths] = useState<readonly string[]>([]);

	const { model } = useFileTree({
		paths,
		initialExpansion: 'closed',
		renaming: { onRename: (event) => { void handleRename(event); } },
		dragAndDrop: { onDropComplete: (event) => { void handleDrop(event); } },
		onSelectionChange: (next) => { setSelectedPaths(next); },
		renderRowDecoration: (context: FileTreeRowDecorationContext): FileTreeRowDecoration | null => {
			if (context.row.kind !== 'file') return null;
			const root = rootPathRef.current;
			if (!root) return null;
			const abs = joinAbs(root, context.item.path);
			const entry = getCachedLabel(abs);
			if (entry && entry !== 'pending') {
				return { text: `${entry.emoji} ${entry.label}`, title: entry.label };
			}
			requestLabel(abs, false);
			return null;
		},
	});

	useEffect(() => {
		treeRef.current = model;
	}, [model, treeRef]);

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
		// Preserve expansion across resets so opening a file doesn't collapse
		// the user's currently-expanded folders.
		const expanded: string[] = [];
		for (const p of prev) {
			if (!p.endsWith('/')) continue;
			const item = model.getItem(p);
			if (item && item.isDirectory() && (item as { isExpanded(): boolean }).isExpanded()) {
				expanded.push(p);
			}
		}
		model.resetPaths(paths, expanded.length ? { initialExpandedPaths: expanded } : undefined);
		prevPathsRef.current = paths;
	}, [model, paths]);

	// useEffect(() => {
	// 	let frame: number | null = null;
	// 	let count = 0;
	// 	const trigger = () => {
	// 		count += 1;
	// 		if (count < 20) console.log('[FileTree] label trigger', count);
	// 		if (frame != null) return;
	// 		frame = window.requestAnimationFrame(() => {
	// 			frame = null;
	// 			try {
	// 				model.setGitStatus([]);
	// 			} catch {
	// 				// best-effort re-render trigger
	// 			}
	// 		});
	// 	};
	// 	const unsub = subscribeAllLabels(trigger);
	// 	return () => {
	// 		unsub();
	// 		if (frame != null) window.cancelAnimationFrame(frame);
	// 	};
	// }, [model]);

	useEffect(() => {
		let frame: number | null = null;
		const trigger = () => {
			if (frame != null) return;
			frame = window.requestAnimationFrame(() => {
				frame = null;
				try {
					model.setGitStatus([]);
				} catch {
					// best-effort re-render trigger
				}
			});
		};
		const unsub = subscribeAllLabels(trigger);
		return () => {
			unsub();
			if (frame != null) window.cancelAnimationFrame(frame);
		};
	}, [model]);

	useEffect(() => {
		const fsCurrent = fsRef.current;
		if (selectedPaths.length === 0) {
			fsCurrent.clearSelection();
			return;
		}
		if (selectedPaths.length === 1) {
			const rel = selectedPaths[0];
			const abs = relToAbs(rel);
			fsCurrent.select(abs);
			const isDir = rel.endsWith('/');
			if (!isDir) {
				workspaceRef.current.openInEditor(abs);
			}
			return;
		}
		const [first, ...rest] = selectedPaths;
		fsCurrent.select(relToAbs(first));
		for (const rel of rest) fsCurrent.toggleSelect(relToAbs(rel));
	}, [selectedPaths, relToAbs]);

	const handleCreate = useCallback(async (parentRel: string | null, type: 'file' | 'folder') => {
		const root = rootPathRef.current;
		if (!root) return;
		const parentAbs = parentRel == null ? root : relToAbs(parentRel);
		const defaultName = type === 'folder' ? 'untitled folder' : 'untitled';
		const name = await inputControllerRef.current.prompt({
			title: type === 'folder' ? 'New Folder' : 'New File',
			message: 'Enter a name:',
			messagePlaceholder: defaultName,
			initialValue: defaultName,
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
			if (type === 'folder') {
				await fsRef.current.createDirectory(trimmed);
			} else {
				await fsRef.current.createFile(trimmed);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to create item.');
		}
	}, [relToAbs]);

	const handleRenameRequest = useCallback(async (rel: string, currentName: string) => {
		const next = await inputControllerRef.current.prompt({
			title: 'Rename',
			message: 'Enter the new name:',
			messagePlaceholder: currentName,
			initialValue: currentName,
			confirmText: 'Rename',
		});
		if (next === null) return;
		const trimmed = next.trim();
		if (!trimmed || trimmed === currentName) return;
		try {
			await fsRef.current.rename(relToAbs(rel), trimmed);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to rename item.');
		}
	}, [relToAbs]);

	const handleDeleteRequest = useCallback(async (rel: string) => {
		const selectedFromModel = model.getSelectedPaths();
		const targets = selectedFromModel.includes(rel) && selectedFromModel.length > 0
			? Array.from(selectedFromModel)
			: [rel];

		const sorted = [...targets].sort((a, b) => a.length - b.length);
		const topLevel = sorted.filter((path, idx) => {
			return !sorted.slice(0, idx).some((candidate) => {
				const candDir = candidate.endsWith('/') ? candidate : candidate + '/';
				return path === candidate || path.startsWith(candDir);
			});
		});

		try {
			for (const target of topLevel) {
				await fsRef.current.remove(relToAbs(target));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete item.');
		}
	}, [model, relToAbs]);

	const renderContextMenu = useCallback(
		(item: PierreContextMenuItem, context: PierreContextMenuOpenContext) => {
			const itemRel = item.path;
			const isFolder = item.kind === 'directory';
			const parentRel = isFolder
				? itemRel.replace(/[\\/]+$/, '')
				: dirname(itemRel);
			const createParentRel = parentRel === '' ? null : parentRel;
			const itemName = item.name || basename(itemRel);

			const itemClass = cn(
				'flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
				'hover:bg-foreground/10 focus:bg-foreground/10 text-popover-foreground',
			);
			const destructiveClass = cn(itemClass, 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10');

			return (
				<div
					data-slot="context-menu-content"
					className={cn(
						'z-50 min-w-36 overflow-hidden rounded-md p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 relative bg-popover/70',
						'before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150',
					)}
				>
					<button
						type="button"
						className={itemClass}
						onClick={() => { context.close({ restoreFocus: false }); void handleCreate(createParentRel, 'file'); }}
					>
						New File
					</button>
					<button
						type="button"
						className={itemClass}
						onClick={() => { context.close({ restoreFocus: false }); void handleCreate(createParentRel, 'folder'); }}
					>
						New Folder
					</button>
					<div role="separator" className="my-1 h-px bg-foreground/10" />
					<button
						type="button"
						className={itemClass}
						onClick={() => { context.close({ restoreFocus: false }); void handleRenameRequest(itemRel, itemName); }}
					>
						Rename
					</button>
					<div role="separator" className="my-1 h-px bg-foreground/10" />
					<button
						type="button"
						className={destructiveClass}
						onClick={() => { context.close({ restoreFocus: false }); void handleDeleteRequest(itemRel); }}
					>
						Delete
					</button>
				</div>
			);
		},
		[handleCreate, handleRenameRequest, handleDeleteRequest],
	);

	return (
		<>
			<PierreFileTree
				model={model}
				renderContextMenu={renderContextMenu}
				style={{ height: 320 }}
			/>
			<InputModal controller={inputController} />
		</>
	);
}
