import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { Tree, NodeRendererProps } from 'react-arborist';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { TreeItem, treeRecordToItems } from '@/renderer/hooks/useTree';
import { Path } from '@/shared/fsUtils';
import { toast } from 'sonner';

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

export function FileTree() {
	const { fs, treeRef } = useWorkbench();
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

		const [firstNode, ...restNodes] = selectedNodes;
		fs.select(firstNode.id);
		for (const node of restNodes) {
			fs.toggleSelect(node.id);
		}
	}, [fs]);

	const handleFocus = useCallback((node: { id: string }) => {
		fs.ensureSelected(node.id);
	}, [fs]);

	const handleToggle = useCallback((id: string) => {
		void fs.toggle(id);
	}, [fs]);

	return (
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
		>
			{Node}
		</Tree>
	)
}


function Node({ node, style, dragHandle }: NodeRendererProps<TreeItem>) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!node.isEditing) {
			return;
		}

		inputRef.current?.focus();
		inputRef.current?.select();
	}, [node.isEditing]);

	return (
		<div style={style} ref={dragHandle}>
			<span
				onClick={(event) => {
					event.stopPropagation();
					if (!node.isLeaf) {
						node.toggle();
					}
				}}
			>
				{node.isLeaf ? '🍁' : node.isOpen ? '🗁' : '🗀'}
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
				node.data.name
			)}
		</div>
	);
}
