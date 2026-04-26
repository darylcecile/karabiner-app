import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type RefObject,
} from 'react';
import { cn } from '@/shared/utils';
import { TreeContextMenu } from './TreeContextMenu';
import { TreeRowItem, type TreeRowDragHandlers } from './TreeRow';
import { useTreeModel, type TreeKind, type TreeRow } from './useTreeModel';

export type { TreeKind, TreeRow };

export interface TreeRenderContext {
	path: string;
	name: string;
	kind: TreeKind;
	depth: number;
}

export interface TreeIconContext {
	path: string;
	kind: TreeKind;
	expanded: boolean;
}

export interface TreeDecorationContext {
	path: string;
	kind: TreeKind;
}

export interface TreeRenameEvent {
	sourcePath: string;
	destinationPath: string;
	isDirectory: boolean;
}

export interface TreeRenamingProps {
	onRename: (event: TreeRenameEvent) => void | Promise<void>;
	canRename?: (path: string) => boolean;
	onError?: (error: Error) => void;
}

export interface TreeDropEvent {
	draggedPaths: readonly string[];
	targetPath: string | null;
	targetKind: 'folder' | 'root';
}

export interface TreeExternalDropEvent {
	files: readonly File[];
	targetPath: string | null;
	targetKind: 'folder' | 'root';
}

export interface TreeDragAndDropProps {
	onDrop: (event: TreeDropEvent) => void | Promise<void>;
	onExternalDrop?: (event: TreeExternalDropEvent) => void | Promise<void>;
	onNativeDragStart?: (paths: readonly string[]) => void;
	canDrag?: (path: string) => boolean;
	canDrop?: (event: { draggedPaths: readonly string[]; targetPath: string | null }) => boolean;
	onError?: (error: Error) => void;
}

export interface TreeContextMenuContext {
	path: string | null;
	kind: 'file' | 'folder' | 'root';
	close: () => void;
}

export interface TreeContextMenuRequest {
	path: string | null;
	kind: 'file' | 'folder' | 'root';
	clientX: number;
	clientY: number;
}

export interface TreeProps {
	paths: readonly string[];
	initialExpansion?: 'open' | 'closed' | readonly string[];
	selectedPath?: string | null;
	onSelect?: (path: string) => void;
	onActivate?: (path: string) => void;
	onExpansionChange?: (expanded: ReadonlySet<string>) => void;
	renderPrimary?: (ctx: TreeRenderContext) => ReactNode | null | undefined;
	renderDecoration?: (ctx: TreeDecorationContext) => ReactNode | null;
	renderIcon?: (ctx: TreeIconContext) => ReactNode | null;
	renderContextMenu?: (ctx: TreeContextMenuContext) => ReactNode;
	onContextMenuRequest?: (req: TreeContextMenuRequest) => void;
	renaming?: TreeRenamingProps;
	dragAndDrop?: TreeDragAndDropProps;
	itemHeight?: number;
	overscan?: number;
	indentPx?: number;
	className?: string;
	style?: CSSProperties;
	modelRef?: RefObject<TreeHandle | null>;
	'aria-label'?: string;
}

export interface TreeHandle {
	expand(path: string): void;
	collapse(path: string): void;
	toggle(path: string): void;
	isExpanded(path: string): boolean;
	setExpansion(paths: readonly string[]): void;
	getExpandedPaths(): readonly string[];
	focusPath(path: string): void;
	scrollPathIntoView(path: string): void;
	startRenaming(path: string): boolean;
}

const DEFAULT_ITEM_HEIGHT = 28;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_INDENT = 16;
const AUTO_EXPAND_DELAY_MS = 600;

function basenameOf(path: string): string {
	const cleaned = path.endsWith('/') ? path.slice(0, -1) : path;
	const idx = cleaned.lastIndexOf('/');
	return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

function parentPathOf(path: string): string | null {
	const cleaned = path.endsWith('/') ? path.slice(0, -1) : path;
	const idx = cleaned.lastIndexOf('/');
	if (idx === -1) return null;
	return cleaned.slice(0, idx) + '/';
}

const DRAG_MIME = 'application/x-karabiner-tree-path';

export function Tree(props: TreeProps) {
	const {
		paths,
		initialExpansion = 'closed',
		selectedPath = null,
		onSelect,
		onActivate,
		onExpansionChange,
		renderPrimary,
		renderDecoration,
		renderIcon,
		renderContextMenu,
		onContextMenuRequest,
		renaming,
		dragAndDrop,
		itemHeight = DEFAULT_ITEM_HEIGHT,
		overscan = DEFAULT_OVERSCAN,
		indentPx = DEFAULT_INDENT,
		className,
		style,
		modelRef,
		'aria-label': ariaLabel,
	} = props;

	const model = useTreeModel({ paths, initialExpansion });
	const { visible, expand, collapse, toggle, isExpanded, setExpansion, getExpandedPaths, indexOf, firstChildIndexAfter, expanded } = model;

	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportH, setViewportH] = useState(0);
	const [focusedPath, setFocusedPath] = useState<string | null>(null);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [draggingPath, setDraggingPath] = useState<string | null>(null);
	const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // folder path or null = root
	const renamingPathRef = useRef<string | null>(null);
	renamingPathRef.current = renamingPath;
	const renamingPropsRef = useRef(renaming);
	renamingPropsRef.current = renaming;
	const dragPropsRef = useRef(dragAndDrop);
	dragPropsRef.current = dragAndDrop;

	// Track scroll
	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const onScroll = () => setScrollTop(el.scrollTop);
		el.addEventListener('scroll', onScroll, { passive: true });
		setScrollTop(el.scrollTop);
		return () => el.removeEventListener('scroll', onScroll);
	}, []);

	// Track size
	useLayoutEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		setViewportH(el.clientHeight);
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				const cr = e.contentRect;
				setViewportH(cr.height);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Notify expansion changes
	const lastNotifiedRef = useRef<ReadonlySet<string> | null>(null);
	useEffect(() => {
		if (!onExpansionChange) return;
		if (lastNotifiedRef.current === expanded) return;
		lastNotifiedRef.current = expanded;
		onExpansionChange(expanded);
	}, [expanded, onExpansionChange]);

	// Initial focus when selectedPath provided
	useEffect(() => {
		if (focusedPath == null && selectedPath) setFocusedPath(selectedPath);
	}, [focusedPath, selectedPath]);

	// If focused row got removed (paths changed / parent collapsed), drop focus.
	useEffect(() => {
		if (focusedPath != null && indexOf(focusedPath) === -1) {
			setFocusedPath(null);
		}
	}, [focusedPath, indexOf]);

	const total = visible.length;
	const totalH = total * itemHeight;

	const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
	const endIdx = Math.min(
		total,
		Math.ceil((scrollTop + viewportH) / itemHeight) + overscan,
	);

	const scrollIndexIntoView = useCallback(
		(idx: number) => {
			const el = scrollerRef.current;
			if (!el || idx < 0) return;
			const top = idx * itemHeight;
			const bottom = top + itemHeight;
			const vTop = el.scrollTop;
			const vBottom = vTop + el.clientHeight;
			if (top < vTop) {
				el.scrollTop = top;
			} else if (bottom > vBottom) {
				el.scrollTop = bottom - el.clientHeight;
			}
		},
		[itemHeight],
	);

	// Focus a row DOM element by path.
	const pendingFocusRef = useRef<string | null>(null);
	const rowEls = useRef(new Map<string, HTMLDivElement>());

	const focusRow = useCallback(
		(path: string) => {
			setFocusedPath(path);
			const idx = indexOf(path);
			if (idx >= 0) scrollIndexIntoView(idx);
			const el = rowEls.current.get(path);
			if (el) {
				el.focus({ preventScroll: true });
			} else {
				pendingFocusRef.current = path;
			}
		},
		[indexOf, scrollIndexIntoView],
	);

	useLayoutEffect(() => {
		const p = pendingFocusRef.current;
		if (!p) return;
		const el = rowEls.current.get(p);
		if (el) {
			el.focus({ preventScroll: true });
			pendingFocusRef.current = null;
		}
	});

	// Rename / drag-drop helpers
	const visibleRef = useRef(visible);
	visibleRef.current = visible;

	const startRenaming = useCallback(
		(path: string): boolean => {
			const r = renamingPropsRef.current;
			if (!r) return false;
			if (r.canRename && !r.canRename(path)) return false;
			const idx = indexOf(path);
			if (idx < 0) return false;
			setRenamingPath(path);
			scrollIndexIntoView(idx);
			return true;
		},
		[indexOf, scrollIndexIntoView],
	);

	const cancelRename = useCallback(() => {
		const path = renamingPathRef.current;
		setRenamingPath(null);
		if (path) {
			// Restore focus to the row.
			requestAnimationFrame(() => {
				const el = rowEls.current.get(path);
				el?.focus({ preventScroll: true });
			});
		}
	}, []);

	const commitRename = useCallback(
		async (sourcePath: string, rawName: string) => {
			const r = renamingPropsRef.current;
			if (!r) {
				setRenamingPath(null);
				return;
			}
			const trimmed = rawName.trim();
			const isFolder = sourcePath.endsWith('/');
			const oldName = basenameOf(sourcePath);
			if (!trimmed) {
				r.onError?.(new Error('Name cannot be empty.'));
				return;
			}
			if (trimmed === oldName) {
				cancelRename();
				return;
			}
			if (trimmed.includes('/') || trimmed.includes('\\')) {
				r.onError?.(new Error('Name cannot contain path separators.'));
				return;
			}
			const parent = parentPathOf(sourcePath);
			const destBase = isFolder ? trimmed + '/' : trimmed;
			const destinationPath = parent ? parent + (isFolder ? trimmed + '/' : trimmed) : destBase;
			setRenamingPath(null);
			try {
				await r.onRename({ sourcePath, destinationPath, isDirectory: isFolder });
			} catch (err) {
				r.onError?.(err instanceof Error ? err : new Error(String(err)));
			}
		},
		[cancelRename],
	);

	// Drag-and-drop bookkeeping
	const autoExpandTimerRef = useRef<number | null>(null);
	const autoExpandTargetRef = useRef<string | null>(null);

	const clearAutoExpand = useCallback(() => {
		if (autoExpandTimerRef.current != null) {
			window.clearTimeout(autoExpandTimerRef.current);
			autoExpandTimerRef.current = null;
		}
		autoExpandTargetRef.current = null;
	}, []);

	const scheduleAutoExpand = useCallback(
		(folderPath: string) => {
			if (autoExpandTargetRef.current === folderPath) return;
			clearAutoExpand();
			autoExpandTargetRef.current = folderPath;
			autoExpandTimerRef.current = window.setTimeout(() => {
				if (autoExpandTargetRef.current === folderPath) {
					expand(folderPath);
				}
				autoExpandTimerRef.current = null;
			}, AUTO_EXPAND_DELAY_MS);
		},
		[clearAutoExpand, expand],
	);

	useEffect(() => () => clearAutoExpand(), [clearAutoExpand]);

	// Resolve a row path to its drop target folder (or null = root).
	// File rows resolve to their parent folder.
	const resolveDropTarget = useCallback((path: string, kind: TreeKind): string | null => {
		if (kind === 'folder') return path;
		return parentPathOf(path);
	}, []);

	const isInsideOrSelf = useCallback((srcFolder: string, candidate: string | null): boolean => {
		if (!srcFolder.endsWith('/')) return false;
		if (candidate == null) return false;
		if (candidate === srcFolder) return true;
		return candidate.startsWith(srcFolder);
	}, []);

	const dragHandlers = useMemo<TreeRowDragHandlers | undefined>(() => {
		if (!dragAndDrop) return undefined;
		const isExternalDrag = (e: React.DragEvent) => {
			const types = e.dataTransfer.types;
			if (!types) return false;
			for (let i = 0; i < types.length; i++) {
				if (types[i] === 'Files') return true;
			}
			return false;
		};
		return {
			onDragStart: (path, e) => {
				if (renamingPathRef.current) {
					e.preventDefault();
					return;
				}
				const dnd = dragPropsRef.current!;
				if (dnd.canDrag && !dnd.canDrag(path)) {
					e.preventDefault();
					return;
				}
				if (dnd.onNativeDragStart) {
					// Hand the drag to the OS so users can drag tree items into Finder /
					// other apps. Internal moves are handled at drop time by sniffing the
					// dropped Files paths against the workspace root.
					e.preventDefault();
					setDraggingPath(path);
					try {
						dnd.onNativeDragStart([path]);
					} catch {
						// ignore — startDrag failures shouldn't block the UI
					}
					return;
				}
				try {
					e.dataTransfer.setData(DRAG_MIME, path);
					e.dataTransfer.setData('text/plain', path);
				} catch {
					// ignore
				}
				e.dataTransfer.effectAllowed = 'move';
				setDraggingPath(path);
			},
			onDragEnd: () => {
				setDraggingPath(null);
				setDragOverTarget(null);
				clearAutoExpand();
			},
			onDragEnter: (path, e) => {
				const kind: TreeKind = path.endsWith('/') ? 'folder' : 'file';
				const target = resolveDropTarget(path, kind);
				const dnd = dragPropsRef.current!;
				if (isExternalDrag(e)) {
					if (!dnd.onExternalDrop) return;
					e.preventDefault();
					setDragOverTarget(target);
					if (kind === 'folder') scheduleAutoExpand(path);
					else clearAutoExpand();
					return;
				}
				const src = draggingPath;
				if (src && src.endsWith('/') && isInsideOrSelf(src, target)) {
					return;
				}
				const draggedPaths: readonly string[] = src ? [src] : [];
				if (dnd.canDrop && !dnd.canDrop({ draggedPaths, targetPath: target })) return;
				e.preventDefault();
				setDragOverTarget(target);
				if (kind === 'folder') scheduleAutoExpand(path);
				else clearAutoExpand();
			},
			onDragOver: (path, e) => {
				const kind: TreeKind = path.endsWith('/') ? 'folder' : 'file';
				const target = resolveDropTarget(path, kind);
				const dnd = dragPropsRef.current!;
				if (isExternalDrag(e)) {
					if (!dnd.onExternalDrop) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = 'copy';
					if (dragOverTarget !== target) setDragOverTarget(target);
					if (kind === 'folder') scheduleAutoExpand(path);
					return;
				}
				const src = draggingPath;
				if (src && src.endsWith('/') && isInsideOrSelf(src, target)) return;
				const draggedPaths: readonly string[] = src ? [src] : [];
				if (dnd.canDrop && !dnd.canDrop({ draggedPaths, targetPath: target })) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				if (dragOverTarget !== target) setDragOverTarget(target);
				if (kind === 'folder') scheduleAutoExpand(path);
			},
			onDragLeave: () => {
				// We don't clear dragOverTarget here aggressively because dragenter on
				// the next row will overwrite it; clearing on every leave causes flicker.
			},
			onDrop: async (path, e) => {
				e.preventDefault();
				e.stopPropagation();
				const dnd = dragPropsRef.current!;
				const kind: TreeKind = path.endsWith('/') ? 'folder' : 'file';
				const target = resolveDropTarget(path, kind);
				const targetKind: 'folder' | 'root' = target == null ? 'root' : 'folder';

				if (isExternalDrag(e) && dnd.onExternalDrop) {
					const files: File[] = [];
					const list = e.dataTransfer.files;
					for (let i = 0; i < list.length; i++) files.push(list[i]);
					setDraggingPath(null);
					setDragOverTarget(null);
					clearAutoExpand();
					if (files.length === 0) return;
					try {
						await dnd.onExternalDrop({ files, targetPath: target, targetKind });
					} catch (err) {
						dnd.onError?.(err instanceof Error ? err : new Error(String(err)));
					}
					return;
				}

				let dragged = '';
				try {
					dragged = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain') || '';
				} catch {
					dragged = '';
				}
				if (!dragged && draggingPath) dragged = draggingPath;
				const draggedPaths: readonly string[] = dragged ? [dragged] : [];
				setDraggingPath(null);
				setDragOverTarget(null);
				clearAutoExpand();
				if (draggedPaths.length === 0) return;
				if (dnd.canDrop && !dnd.canDrop({ draggedPaths, targetPath: target })) return;
				try {
					await dnd.onDrop({ draggedPaths, targetPath: target, targetKind });
				} catch (err) {
					dnd.onError?.(err instanceof Error ? err : new Error(String(err)));
				}
			},
		};
	}, [
		dragAndDrop,
		draggingPath,
		dragOverTarget,
		resolveDropTarget,
		isInsideOrSelf,
		scheduleAutoExpand,
		clearAutoExpand,
	]);

	// Root-level drop on background
	const onRootDragOver = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			if (!dragAndDrop) return;
			const dnd = dragPropsRef.current!;
			const types = e.dataTransfer.types;
			let external = false;
			if (types) for (let i = 0; i < types.length; i++) if (types[i] === 'Files') { external = true; break; }
			if (external) {
				if (!dnd.onExternalDrop) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				if (dragOverTarget !== null) setDragOverTarget(null);
				clearAutoExpand();
				return;
			}
			const draggedPaths: readonly string[] = draggingPath ? [draggingPath] : [];
			if (dnd.canDrop && !dnd.canDrop({ draggedPaths, targetPath: null })) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			if (dragOverTarget !== null) setDragOverTarget(null);
			clearAutoExpand();
		},
		[dragAndDrop, draggingPath, dragOverTarget, clearAutoExpand],
	);

	const onRootDrop = useCallback(
		async (e: React.DragEvent<HTMLDivElement>) => {
			if (!dragAndDrop) return;
			e.preventDefault();
			const dnd = dragPropsRef.current!;

			const types = e.dataTransfer.types;
			let external = false;
			if (types) for (let i = 0; i < types.length; i++) if (types[i] === 'Files') { external = true; break; }
			if (external && dnd.onExternalDrop) {
				const files: File[] = [];
				const list = e.dataTransfer.files;
				for (let i = 0; i < list.length; i++) files.push(list[i]);
				setDraggingPath(null);
				setDragOverTarget(null);
				clearAutoExpand();
				if (files.length === 0) return;
				try {
					await dnd.onExternalDrop({ files, targetPath: null, targetKind: 'root' });
				} catch (err) {
					dnd.onError?.(err instanceof Error ? err : new Error(String(err)));
				}
				return;
			}

			let dragged = '';
			try {
				dragged = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain') || '';
			} catch {
				dragged = '';
			}
			if (!dragged && draggingPath) dragged = draggingPath;
			const draggedPaths: readonly string[] = dragged ? [dragged] : [];
			setDraggingPath(null);
			setDragOverTarget(null);
			clearAutoExpand();
			if (draggedPaths.length === 0) return;
			if (dnd.canDrop && !dnd.canDrop({ draggedPaths, targetPath: null })) return;
			try {
				await dnd.onDrop({ draggedPaths, targetPath: null, targetKind: 'root' });
			} catch (err) {
				dnd.onError?.(err instanceof Error ? err : new Error(String(err)));
			}
		},
		[dragAndDrop, draggingPath, clearAutoExpand],
	);

	// Imperative handle.
	useImperativeHandle(
		modelRef,
		(): TreeHandle => ({
			expand,
			collapse,
			toggle,
			isExpanded,
			setExpansion,
			getExpandedPaths,
			focusPath: focusRow,
			scrollPathIntoView: (p: string) => {
				const idx = indexOf(p);
				if (idx >= 0) scrollIndexIntoView(idx);
			},
			startRenaming,
		}),
		[expand, collapse, toggle, isExpanded, setExpansion, getExpandedPaths, focusRow, indexOf, scrollIndexIntoView, startRenaming],
	);

	// Click handlers
	const handleClick = useCallback(
		(path: string, kind: TreeKind) => {
			if (renamingPathRef.current) return;
			setFocusedPath(path);
			if (kind === 'folder') {
				toggle(path);
			}
			onSelect?.(path);
		},
		[onSelect, toggle],
	);

	const handleDoubleClick = useCallback(
		(path: string, kind: TreeKind) => {
			if (renamingPathRef.current) return;
			if (kind === 'file') onActivate?.(path);
		},
		[onActivate],
	);

	const handleChevronClick = useCallback(
		(path: string) => {
			toggle(path);
		},
		[toggle],
	);

	const handleMouseDownFocus = useCallback((path: string) => {
		setFocusedPath(path);
	}, []);

	// Keyboard navigation (delegated on container)
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (renamingPathRef.current) return;
			if (visible.length === 0) return;
			const curPath = focusedPath ?? selectedPath ?? visible[0]?.path ?? null;
			const curIdx = curPath ? indexOf(curPath) : -1;

			const move = (idx: number) => {
				if (idx < 0 || idx >= visible.length) return;
				focusRow(visible[idx].path);
			};
			const pageRows = Math.max(1, Math.floor(viewportH / itemHeight));

			if (e.key === 'F2') {
				if (curIdx >= 0) {
					e.preventDefault();
					startRenaming(visible[curIdx].path);
				}
				return;
			}

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					if (curIdx < 0) move(0);
					else move(Math.min(visible.length - 1, curIdx + 1));
					break;
				case 'ArrowUp':
					e.preventDefault();
					if (curIdx <= 0) move(0);
					else move(curIdx - 1);
					break;
				case 'ArrowRight': {
					e.preventDefault();
					if (curIdx < 0) return;
					const r = visible[curIdx];
					if (r.kind !== 'folder') return;
					if (!r.expanded) {
						expand(r.path);
					} else {
						const child = firstChildIndexAfter(curIdx);
						if (child >= 0) move(child);
					}
					break;
				}
				case 'ArrowLeft': {
					e.preventDefault();
					if (curIdx < 0) return;
					const r = visible[curIdx];
					if (r.kind === 'folder' && r.expanded) {
						collapse(r.path);
					} else if (r.parentPath) {
						const parentIdx = indexOf(r.parentPath);
						if (parentIdx >= 0) move(parentIdx);
					}
					break;
				}
				case 'Enter': {
					e.preventDefault();
					if (curIdx < 0) return;
					const r = visible[curIdx];
					if (r.kind === 'folder') toggle(r.path);
					onActivate?.(r.path);
					break;
				}
				case ' ': {
					e.preventDefault();
					if (curIdx < 0) return;
					onSelect?.(visible[curIdx].path);
					break;
				}
				case 'Home':
					e.preventDefault();
					move(0);
					break;
				case 'End':
					e.preventDefault();
					move(visible.length - 1);
					break;
				case 'PageDown':
					e.preventDefault();
					move(Math.min(visible.length - 1, (curIdx < 0 ? 0 : curIdx) + pageRows));
					break;
				case 'PageUp':
					e.preventDefault();
					move(Math.max(0, (curIdx < 0 ? 0 : curIdx) - pageRows));
					break;
				default:
					break;
			}
		},
		[
			visible,
			focusedPath,
			selectedPath,
			indexOf,
			focusRow,
			viewportH,
			itemHeight,
			expand,
			collapse,
			toggle,
			firstChildIndexAfter,
			onActivate,
			onSelect,
			startRenaming,
		],
	);

	const [contextMenuState, setContextMenuState] = useState<
		{ x: number; y: number; path: string | null; kind: TreeKind | 'root' } | null
	>(null);

	const handleContextMenu = useCallback(
		(path: string, kind: TreeKind, e: React.MouseEvent) => {
			if (!renderContextMenu && !onContextMenuRequest) return;
			e.preventDefault();
			e.stopPropagation();
			setFocusedPath(path);
			if (onContextMenuRequest) {
				onContextMenuRequest({ path, kind, clientX: e.clientX, clientY: e.clientY });
				return;
			}
			setContextMenuState({ x: e.clientX, y: e.clientY, path, kind });
		},
		[renderContextMenu, onContextMenuRequest],
	);

	const handleRootContextMenu = useCallback(
		(e: React.MouseEvent) => {
			if (!renderContextMenu && !onContextMenuRequest) return;
			// Ignore events that came from within a row — those are handled by handleContextMenu.
			const target = e.target as HTMLElement | null;
			if (target?.closest('[role="treeitem"]')) return;
			e.preventDefault();
			if (onContextMenuRequest) {
				onContextMenuRequest({ path: null, kind: 'root', clientX: e.clientX, clientY: e.clientY });
				return;
			}
			setContextMenuState({ x: e.clientX, y: e.clientY, path: null, kind: 'root' });
		},
		[renderContextMenu, onContextMenuRequest],
	);

	const closeContextMenu = useCallback(() => {
		setContextMenuState(null);
	}, []);

	const rowsToRender = useMemo(() => {
		const out: ReactNode[] = [];
		for (let i = startIdx; i < endIdx; i++) {
			const row = visible[i];
			if (!row) continue;
			const isSelected = selectedPath === row.path;
			const isFocused = focusedPath === row.path;
			const tab = isFocused || (focusedPath == null && i === 0) ? 0 : -1;
			const isRenamingRow = renamingPath === row.path;
			const isDragOver = dragOverTarget != null && dragOverTarget === row.path && row.kind === 'folder';

			const primary = renderPrimary
				? renderPrimary({ path: row.path, name: row.name, kind: row.kind, depth: row.depth }) ?? null
				: null;
			const decoration = renderDecoration
				? renderDecoration({ path: row.path, kind: row.kind }) ?? null
				: null;
			const icon = renderIcon
				? renderIcon({ path: row.path, kind: row.kind, expanded: row.expanded }) ?? null
				: null;

			out.push(
				<TreeRowItem
					key={row.path}
					row={row}
					top={i * itemHeight}
					height={itemHeight}
					posInSet={i + 1}
					setSize={total}
					selected={isSelected}
					focused={isFocused}
					tabIndex={tab}
					indentPx={indentPx}
					primary={primary}
					decoration={decoration}
					icon={icon}
					onClick={handleClick}
					onDoubleClick={handleDoubleClick}
					onChevronClick={handleChevronClick}
					onMouseDownFocus={handleMouseDownFocus}
					onContextMenu={(renderContextMenu || onContextMenuRequest) ? handleContextMenu : undefined}
					draggable={dragAndDrop != null}
					dragHandlers={dragHandlers}
					dragOver={isDragOver}
					rename={
						isRenamingRow
							? {
								initialName: row.name,
								onCommit: (next) => {
									void commitRename(row.path, next);
								},
								onCancel: cancelRename,
							}
							: null
					}
					rowRef={(el) => {
						if (el) rowEls.current.set(row.path, el);
						else rowEls.current.delete(row.path);
					}}
				/>,
			);
		}
		return out;
	}, [
		startIdx,
		endIdx,
		visible,
		total,
		selectedPath,
		focusedPath,
		renamingPath,
		dragOverTarget,
		itemHeight,
		indentPx,
		renderPrimary,
		renderDecoration,
		renderIcon,
		renderContextMenu,
		onContextMenuRequest,
		handleClick,
		handleDoubleClick,
		handleChevronClick,
		handleMouseDownFocus,
		handleContextMenu,
		dragAndDrop,
		dragHandlers,
		commitRename,
		cancelRename,
	]);

	const containerStyle: CSSProperties = {
		// minHeight: 240,
		...style,
	};

	return (
		<div
			ref={scrollerRef}
			role="tree"
			aria-label={ariaLabel}
			tabIndex={focusedPath ? -1 : 0}
			onKeyDown={onKeyDown}
			onDragOver={dragAndDrop ? onRootDragOver : undefined}
			onDrop={dragAndDrop ? onRootDrop : undefined}
			onContextMenu={(renderContextMenu || onContextMenuRequest) ? handleRootContextMenu : undefined}
			className={cn(
				'relative w-full h-full overflow-y-auto overflow-x-hidden',
				'bg-transparent text-sidebar-foreground',
				'focus:outline-none',
				'[scroll-behavior:smooth]',
				className,
			)}
			style={containerStyle}
		>
			<div
				role="presentation"
				style={{ position: 'relative', height: totalH, width: '100%' }}
			>
				{rowsToRender}
			</div>
			{contextMenuState && renderContextMenu && (
				<TreeContextMenu
					x={contextMenuState.x}
					y={contextMenuState.y}
					onClose={closeContextMenu}
				>
					{renderContextMenu({
						path: contextMenuState.path,
						kind: contextMenuState.kind,
						close: closeContextMenu,
					})}
				</TreeContextMenu>
			)}
		</div>
	);
}
