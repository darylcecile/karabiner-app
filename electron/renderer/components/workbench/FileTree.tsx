import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { InputModal, useInputModalController } from '@/renderer/components/workbench/InputModal';
import { Tree, NodeRendererProps } from 'react-arborist';
import { createContext, use, useCallback, useEffect, useMemo, useRef } from 'react';
import { TreeItem, treeRecordToItems } from '@/renderer/hooks/useTree';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@/renderer/components/ui/context-menu';
import { Path } from '@/shared/fsUtils';
import { toast } from 'sonner';
import { cn } from '@/shared/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import { ChevronRight, ChevronDown, FolderAddIcon } from '@hugeicons/core-free-icons';
import { CustomIcons } from './CustomIcons';
import { motion } from "motion/react"

function joinTreePath(parentPath: string, name: string): string {
	if (parentPath === Path.sep) {
		return Path.normalize(`${parentPath}${name}`);
	}

	return Path.normalize(`${parentPath.replace(/[\\/]$/, '')}${Path.sep}${name}`);
}

function createUniqueName(existingNames: Set<string>, baseName: string): string {
	if (!existingNames.has(baseName)) {
		return baseName;
	}

	let suffix = 2;
	let candidate = `${baseName} ${suffix}`;
	while (existingNames.has(candidate)) {
		suffix += 1;
		candidate = `${baseName} ${suffix}`;
	}

	return candidate;
}

function getTopLevelPaths(paths: string[]): string[] {
	const uniquePaths = [...new Set(paths)].sort((left, right) => left.length - right.length);

	return uniquePaths.filter((path, index) => {
		return !uniquePaths.slice(0, index).some((candidate) => {
			return path === candidate || path.startsWith(`${candidate}${Path.sep}`);
		});
	});
}

const FileTreeActionsContext = createContext({
	onRenameRequest: async (_id: string, _currentName: string) => { },
});

export function FileTree() {
	const { fs, treeRef, workspace } = useWorkbench();
	const inputController = useInputModalController();
	const { focusedPath, nodes, rootPath } = fs;

	const data = useMemo(() => {
		if (!rootPath) return [];
		return treeRecordToItems(nodes, rootPath)
	}, [nodes, rootPath]);

	const handleCreate = useCallback(async ({ parentId, type }: { parentId: string | null; type: 'internal' | 'leaf' }) => {
		const parentPath = parentId ?? fs.rootPath;
		if (!parentPath) {
			return null;
		}

		const siblingNames = new Set(fs.getChildren(parentPath).map((child) => child.name));
		const name = createUniqueName(
			siblingNames,
			type === 'internal' ? 'untitled folder' : 'untitled',
		);
		const createdPath = joinTreePath(parentPath, name);

		try {
			fs.select(parentPath);
			if (type === 'internal') {
				await fs.createDirectory(name);
			} else {
				await fs.createFile(name);
			}

			return { id: createdPath };
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to create item.');
			return null;
		}
	}, [fs]);

	const handleRename = useCallback(async ({ id, name }: { id: string; name: string }) => {
		const nextName = name.trim();
		if (!nextName) {
			toast.error('Name cannot be empty.');
			return;
		}

		const currentNode = fs.getNode(id);
		if (!currentNode || currentNode.name === nextName) {
			return;
		}

		try {
			await fs.rename(id, nextName);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to rename item.');
		}
	}, [fs]);

	const handleMove = useCallback(async ({ dragIds, parentId }: { dragIds: string[]; parentId: string | null }) => {
		const destinationPath = parentId ?? fs.rootPath;
		if (!destinationPath) {
			return;
		}

		try {
			for (const sourcePath of getTopLevelPaths(dragIds)) {
				const sourceNode = fs.getNode(sourcePath);
				if (!sourceNode || sourceNode.parentPath === destinationPath) {
					continue;
				}

				await fs.move(sourcePath, destinationPath);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to move item.');
		}
	}, [fs]);

	const handleDelete = useCallback(async ({ ids }: { ids: string[] }) => {
		try {
			for (const id of getTopLevelPaths(ids)) {
				await fs.remove(id);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete item.');
		}
	}, [fs]);

	const handleSelect = useCallback((selectedNodes: Array<{ id: string }>) => {
		if (selectedNodes.length === 0) {
			fs.clearSelection();
			return;
		}

		if (selectedNodes.length === 1) {
			fs.select(selectedNodes[0].id);
			workspace.openInEditor(selectedNodes[0].id);
			return;
		}

		const [firstNode, ...restNodes] = selectedNodes;
		fs.select(firstNode.id);
		for (const node of restNodes) {
			fs.toggleSelect(node.id);
		}
	}, [fs, workspace]);

	const handleFocus = useCallback((node: { id: string }) => {
		fs.ensureSelected(node.id);
	}, [fs]);

	const handleToggle = useCallback((id: string) => {
		void fs.toggle(id);
	}, [fs]);

	const handleRenameRequest = useCallback(async (id: string, currentName: string) => {
		const nextName = await inputController.prompt({
			title: 'Rename',
			message: 'Enter the new name:',
			messagePlaceholder: currentName,
			initialValue: currentName,
			confirmText: 'Rename',
		});

		if (nextName === null) {
			return;
		}

		await handleRename({ id, name: nextName });
	}, [handleRename, inputController]);

	return (
		<FileTreeActionsContext.Provider value={{ onRenameRequest: handleRenameRequest }}>
			<>
				<Tree<TreeItem>
					data={data}
					ref={treeRef}
					idAccessor="id"
					childrenAccessor="children"
					openByDefault={false}
					selectionFollowsFocus
					selection={focusedPath ?? undefined}
					onCreate={handleCreate}
					onRename={handleRename}
					onMove={handleMove}
					onDelete={handleDelete}
					onSelect={handleSelect}
					onFocus={handleFocus}
					onToggle={handleToggle}
					width={"auto"}
					rowHeight={28}
				>
					{TreeNode}
				</Tree>
				<InputModal controller={inputController} />
			</>
		</FileTreeActionsContext.Provider>
	)
}


function TreeNode({ node, style, dragHandle }: NodeRendererProps<TreeItem>) {
	const inputRef = useRef<HTMLInputElement>(null);
	const { fs, treeRef } = useWorkbench();
	const { onRenameRequest } = use(FileTreeActionsContext);

	useEffect(() => {
		if (!node.isEditing) {
			return;
		}

		inputRef.current?.focus();
		inputRef.current?.select();
	}, [node.isEditing]);

	const createParentId =
		node.isLeaf && node.parent && !node.parent.isRoot
			? node.parent.id
			: node.isLeaf
				? null
				: node.id;
	const createParentPath = createParentId ?? fs.rootPath;
	const createIndex = createParentPath ? fs.getChildren(createParentPath).length : 0;

	const hasParent = !!node.parent && !node.parent.isRoot;
	const sourceNode = fs.getNode(node.id);
	const metadataSrc = sourceNode?.metadata ?? sourceNode?.customization ?? node.data.metadata;
	const metadata = metadataSrc?.[sourceNode.path]

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					style={style}
					ref={dragHandle}
					onContextMenuCapture={() => {
						if (node.isSelected) {
							node.focus();
							return;
						}

						node.select();
					}}
					className={cn(
						"text-sm group/item",
						'flex flex-row items-center gap-1 rounded-sm px-1 py-1',
						node.isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5',
						node.isFocused && !node.isSelected && 'bg-foreground/7.5',
					)}
				>
					<span
						onClick={(event) => {
							event.stopPropagation();
							if (!node.isLeaf) {
								node.toggle();
							}
						}}
						className={cn(
							"ml-1 size-5 text-xs min-w-5 bg-foreground/5 flex relative items-center rounded-sm overflow-hidden",
							node.isLeaf && "bg-transparent"
						)}
					>
						<div 
							className={cn(
								"h-4 min-w-8 flex items-center justify-center absolute",
								!node.isLeaf  && "group-hover/item:-translate-x-4 transition-transform left-0",
							)}
						>
							<CustomIcons icon={metadata?.icon ?? (node.isLeaf ? 'file' : 'folder')} strokeWidth={1.5} width={14} className='ml-[3px]'/>
							<HugeiconsIcon icon={!node.isOpen ? ChevronRight : ChevronDown} strokeWidth={1.5} width={16} className='ml-[2px]' />
						</div>
					</span>{' '}
					{node.isEditing ? (
						<input
							ref={inputRef}
							defaultValue={node.data.name}
							onBlur={() => node.reset()}
							onKeyDown={(event) => {
								if (event.key === 'Escape') {
									node.reset();
								}

								if (event.key === 'Enter') {
									node.submit(inputRef.current?.value || '');
								}
							}}
						/>
					) : (
						<div
							className="flex flex-1 items-center"
							onDoubleClick={() => {
								if (node.isLeaf) {
									onRenameRequest(node.id, node.data.name);
								} else {
									node.toggle();
								}
							}}
						>
							<span className="text-ellipsis overflow-hidden flex-1">{node.data.name}</span>
							{!hasParent && (
								<button
									className={cn(
										"size-5 rounded hover:bg-foreground/10 flex items-center justify-center",
										"opacity-0 group-hover/item:opacity-100 transition-opacity",
									)}
									onClick={() => { 
										alert('TODO')
									}}
								>
									<span className="sr-only">New</span>
									<HugeiconsIcon icon={FolderAddIcon} strokeWidth={1} width={14} />
								</button>
							)}
						</div>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					onSelect={() => {
						if (!createParentPath) {
							return;
						}

						void treeRef.current?.create({
							type: 'leaf',
							parentId: createParentId,
							index: createIndex,
						});
					}}
				>
					New File
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => {
						if (!createParentPath) {
							return;
						}

						void treeRef.current?.create({
							type: 'internal',
							parentId: createParentId,
							index: createIndex,
						});
					}}
				>
					New Folder
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={() => {
						void onRenameRequest(node.id, node.data.name);
					}}
				>
					Rename
				</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onSelect={() => {
						const selectedIds = treeRef.current
							? Array.from(treeRef.current.selectedIds)
							: [node.id];
						const idsToDelete =
							node.isSelected && selectedIds.length > 0 ? selectedIds : [node.id];

						void treeRef.current?.delete(idsToDelete);
					}}
				>
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
