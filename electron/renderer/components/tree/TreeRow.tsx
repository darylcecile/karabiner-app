import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ChevronRight, File01Icon, Folder01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import type { TreeKind, TreeRow as TreeRowData } from './useTreeModel';

export interface TreeRowRenameProps {
	initialName: string;
	onCommit: (nextName: string) => void;
	onCancel: () => void;
}

export interface TreeRowDragHandlers {
	onDragStart: (path: string, e: React.DragEvent) => void;
	onDragEnd: (path: string, e: React.DragEvent) => void;
	onDragEnter: (path: string, e: React.DragEvent) => void;
	onDragOver: (path: string, e: React.DragEvent) => void;
	onDragLeave: (path: string, e: React.DragEvent) => void;
	onDrop: (path: string, e: React.DragEvent) => void;
}

export interface TreeRowProps {
	row: TreeRowData;
	top: number;
	height: number;
	posInSet: number;
	setSize: number;
	selected: boolean;
	focused: boolean;
	tabIndex: number;
	indentPx: number;
	primary: ReactNode | null;
	decoration: ReactNode | null;
	icon: ReactNode | null;
	onClick: (path: string, kind: TreeKind, e: React.MouseEvent) => void;
	onDoubleClick: (path: string, kind: TreeKind) => void;
	onChevronClick: (path: string, e: React.MouseEvent) => void;
	onMouseDownFocus: (path: string) => void;
	onContextMenu?: (path: string, kind: TreeKind, e: React.MouseEvent) => void;
	rowRef?: (el: HTMLDivElement | null) => void;
	rename?: TreeRowRenameProps | null;
	draggable?: boolean;
	dragHandlers?: TreeRowDragHandlers;
	dragOver?: boolean;
}

function splitBasename(name: string, isFolder: boolean): { stem: string; ext: string } {
	if (isFolder) return { stem: name, ext: '' };
	const dot = name.lastIndexOf('.');
	if (dot <= 0 || dot === name.length - 1) return { stem: name, ext: '' };
	return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

function TreeRowImpl(props: TreeRowProps) {
	const {
		row,
		top,
		height,
		posInSet,
		setSize,
		selected,
		focused,
		tabIndex,
		indentPx,
		primary,
		decoration,
		icon,
		onClick,
		onDoubleClick,
		onChevronClick,
		onMouseDownFocus,
		onContextMenu,
		rowRef,
		rename,
		draggable,
		dragHandlers,
		dragOver,
	} = props;

	const inputRef = useRef<HTMLInputElement | null>(null);
	const isRenaming = rename != null;
	const renameDoneRef = useRef(false);

	useLayoutEffect(() => {
		if (!isRenaming) {
			renameDoneRef.current = false;
			return;
		}
		renameDoneRef.current = false;
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		const isFolder = row.kind === 'folder';
		const { stem } = splitBasename(rename!.initialName, isFolder);
		try {
			el.setSelectionRange(0, stem.length);
		} catch {
			el.select();
		}
	}, [isRenaming, rename, row.kind]);

	const isFolder = row.kind === 'folder';
	const padLeft = row.depth * indentPx + 6;

	const style: CSSProperties = {
		position: 'absolute',
		left: 4,
		right: 4,
		top,
		height,
		paddingLeft: padLeft,
	};

	const defaultIcon = isFolder ? (
		<HugeiconsIcon icon={Folder01Icon} strokeWidth={1.5} width={14} height={14} />
	) : (
		<HugeiconsIcon icon={File01Icon} strokeWidth={1.5} width={14} height={14} />
	);

	return (
		<div
			ref={rowRef}
			role="treeitem"
			aria-level={row.depth + 1}
			aria-posinset={posInSet}
			aria-setsize={setSize}
			aria-selected={selected || undefined}
			aria-expanded={isFolder ? row.expanded : undefined}
			data-path={row.path}
			data-kind={row.kind}
			data-selected={selected || undefined}
			data-focused={focused || undefined}
			data-renaming={isRenaming || undefined}
			data-drag-over={dragOver || undefined}
			tabIndex={isRenaming ? -1 : tabIndex}
			style={style}
			draggable={draggable && !isRenaming ? true : undefined}
			onMouseDown={() => {
				if (isRenaming) return;
				onMouseDownFocus(row.path);
			}}
			onClick={(e) => {
				if (isRenaming) return;
				onClick(row.path, row.kind, e);
			}}
			onDoubleClick={() => {
				if (isRenaming) return;
				onDoubleClick(row.path, row.kind);
			}}
			onContextMenu={(e) => {
				if (isRenaming) return;
				onContextMenu?.(row.path, row.kind, e);
			}}
			onDragStart={dragHandlers && !isRenaming ? (e) => dragHandlers.onDragStart(row.path, e) : undefined}
			onDragEnd={dragHandlers ? (e) => dragHandlers.onDragEnd(row.path, e) : undefined}
			onDragEnter={dragHandlers ? (e) => dragHandlers.onDragEnter(row.path, e) : undefined}
			onDragOver={dragHandlers ? (e) => dragHandlers.onDragOver(row.path, e) : undefined}
			onDragLeave={dragHandlers ? (e) => dragHandlers.onDragLeave(row.path, e) : undefined}
			onDrop={dragHandlers ? (e) => dragHandlers.onDrop(row.path, e) : undefined}
			className={cn(
				'group flex items-center gap-1.5 pr-2 select-none cursor-default',
				'text-[13px] leading-none text-sidebar-foreground',
				'rounded-md',
				'transition-colors',
				!selected && !dragOver && 'hover:bg-sidebar-accent/60',
				selected && !dragOver && 'bg-sidebar-accent text-sidebar-accent-foreground',
				dragOver && 'bg-sidebar-accent/80 ring-1 ring-ring/40',
				focused && !dragOver && 'ring-1 ring-ring/50',
				'focus:outline-none',
			)}
		>
			<button
				type="button"
				aria-hidden={!isFolder}
				tabIndex={-1}
				onClick={(e) => {
					if (!isFolder) return;
					e.stopPropagation();
					onChevronClick(row.path, e);
				}}
				className={cn(
					'flex shrink-0 items-center justify-center w-4 h-4 -ml-0.5 rounded-sm',
					isFolder
						? 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
						: 'invisible',
				)}
			>
				<HugeiconsIcon
					icon={ChevronRight}
					strokeWidth={2}
					width={12}
					height={12}
					className={cn(
						'transition-transform duration-150 ease-out',
						row.expanded ? 'rotate-90' : 'rotate-0',
					)}
				/>
			</button>

			<span
				className={cn(
					'flex shrink-0 items-center justify-center w-4 h-4',
					isFolder ? 'text-sidebar-foreground/70' : 'text-sidebar-foreground/55',
				)}
			>
				{icon ?? defaultIcon}
			</span>

			{isRenaming ? (
				<input
					ref={inputRef}
					defaultValue={rename!.initialName}
					spellCheck={false}
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					onDoubleClick={(e) => e.stopPropagation()}
					onContextMenu={(e) => e.stopPropagation()}
					onChange={() => {
						renameDoneRef.current = false;
					}}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === 'Enter') {
							e.preventDefault();
							if (renameDoneRef.current) return;
							renameDoneRef.current = true;
							rename!.onCommit(inputRef.current?.value ?? '');
						} else if (e.key === 'Escape') {
							e.preventDefault();
							if (renameDoneRef.current) return;
							renameDoneRef.current = true;
							rename!.onCancel();
						}
					}}
					onBlur={() => {
						if (renameDoneRef.current) return;
						renameDoneRef.current = true;
						rename!.onCommit(inputRef.current?.value ?? '');
					}}
					className={cn(
						'flex-1 min-w-0 bg-background text-foreground',
						'text-[13px] leading-none',
						'h-5 px-1 -my-px rounded-sm',
						'border border-input outline-none',
						'focus:ring-1 focus:ring-ring focus:border-ring',
						isFolder && 'font-medium',
					)}
				/>
			) : (
				<span
					className={cn(
						'flex-1 min-w-0 truncate',
						isFolder && 'font-medium',
					)}
				>
					{primary ?? row.name}
				</span>
			)}

			{decoration != null && (
				<span
					className={cn(
						'shrink-0 max-w-[40%] truncate text-right text-[12px]',
						selected ? 'text-sidebar-accent-foreground/70' : 'text-muted-foreground',
					)}
				>
					{decoration}
				</span>
			)}
		</div>
	);
}

export const TreeRowItem = memo(TreeRowImpl);
TreeRowItem.displayName = 'TreeRowItem';
