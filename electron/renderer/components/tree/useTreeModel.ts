import { useCallback, useMemo, useRef, useState } from 'react';

export type TreeKind = 'file' | 'folder';

export interface TreeRow {
	path: string;
	name: string;
	depth: number;
	kind: TreeKind;
	parentPath: string | null;
	hasChildren: boolean;
	expanded: boolean;
}

function stripTrailing(p: string): string {
	return p.endsWith('/') ? p.slice(0, -1) : p;
}

function basename(p: string): string {
	const cleaned = stripTrailing(p);
	const idx = cleaned.lastIndexOf('/');
	return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

function parentPathOf(p: string): string | null {
	const cleaned = stripTrailing(p);
	const idx = cleaned.lastIndexOf('/');
	if (idx === -1) return null;
	return cleaned.slice(0, idx) + '/';
}

function depthOf(p: string): number {
	const cleaned = stripTrailing(p);
	if (cleaned === '') return 0;
	let d = 0;
	for (let i = 0; i < cleaned.length; i++) if (cleaned.charCodeAt(i) === 47 /* '/' */) d++;
	return d;
}

export interface UseTreeModelOptions {
	paths: readonly string[];
	initialExpansion?: 'open' | 'closed' | readonly string[];
}

export interface UseTreeModelResult {
	visible: TreeRow[];
	expanded: ReadonlySet<string>;
	indexOf: (path: string) => number;
	expand: (path: string) => void;
	collapse: (path: string) => void;
	toggle: (path: string) => void;
	isExpanded: (path: string) => boolean;
	setExpansion: (paths: readonly string[]) => void;
	getExpandedPaths: () => readonly string[];
	parentOf: (path: string) => string | null;
	firstChildIndexAfter: (index: number) => number;
}

function computeInitial(
	paths: readonly string[],
	mode: UseTreeModelOptions['initialExpansion'],
): Set<string> {
	if (mode === 'open') {
		const s = new Set<string>();
		for (const p of paths) if (p.endsWith('/')) s.add(p);
		return s;
	}
	if (mode && mode !== 'closed' && Array.isArray(mode)) {
		return new Set(mode as readonly string[]);
	}
	return new Set();
}

export function useTreeModel(opts: UseTreeModelOptions): UseTreeModelResult {
	const { paths, initialExpansion = 'closed' } = opts;

	// Initialise once. `initialExpansion` is treated as a default; later changes
	// must go through the imperative setExpansion() so we don't clobber user
	// interaction state on every paths update.
	const initialRef = useRef<Set<string> | null>(null);
	if (initialRef.current === null) {
		initialRef.current = computeInitial(paths, initialExpansion);
	}
	const [expanded, setExpanded] = useState<Set<string>>(() => initialRef.current!);

	const visible = useMemo<TreeRow[]>(() => {
		const out: TreeRow[] = [];
		let skipPrefix: string | null = null;
		for (let i = 0; i < paths.length; i++) {
			const p = paths[i];
			if (skipPrefix && p.startsWith(skipPrefix)) continue;
			skipPrefix = null;
			const isFolder = p.endsWith('/');
			const next = paths[i + 1];
			const hasChildren = isFolder && next != null && next.startsWith(p);
			const isExpanded = isFolder && expanded.has(p);
			out.push({
				path: p,
				name: basename(p),
				depth: depthOf(p),
				kind: isFolder ? 'folder' : 'file',
				parentPath: parentPathOf(p),
				hasChildren,
				expanded: isExpanded,
			});
			if (isFolder && !isExpanded) skipPrefix = p;
		}
		return out;
	}, [paths, expanded]);

	const indexMap = useMemo(() => {
		const m = new Map<string, number>();
		for (let i = 0; i < visible.length; i++) m.set(visible[i].path, i);
		return m;
	}, [visible]);

	const indexOf = useCallback((path: string) => indexMap.get(path) ?? -1, [indexMap]);

	const expand = useCallback((path: string) => {
		if (!path.endsWith('/')) return;
		setExpanded((prev) => {
			if (prev.has(path)) return prev;
			const next = new Set(prev);
			next.add(path);
			return next;
		});
	}, []);

	const collapse = useCallback((path: string) => {
		if (!path.endsWith('/')) return;
		setExpanded((prev) => {
			if (!prev.has(path)) return prev;
			const next = new Set(prev);
			next.delete(path);
			return next;
		});
	}, []);

	const toggle = useCallback((path: string) => {
		if (!path.endsWith('/')) return;
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const isExpanded = useCallback((path: string) => expanded.has(path), [expanded]);

	const setExpansion = useCallback((next: readonly string[]) => {
		setExpanded((prev) => {
			if (prev.size === next.length) {
				let same = true;
				for (const p of next) if (!prev.has(p)) { same = false; break; }
				if (same) return prev;
			}
			return new Set(next);
		});
	}, []);

	const getExpandedPaths = useCallback((): readonly string[] => {
		return Array.from(expanded);
	}, [expanded]);

	const parentOf = useCallback((path: string) => parentPathOf(path), []);

	const firstChildIndexAfter = useCallback(
		(index: number) => {
			if (index < 0 || index >= visible.length) return -1;
			const row = visible[index];
			if (row.kind !== 'folder') return -1;
			const next = visible[index + 1];
			if (next && next.path.startsWith(row.path)) return index + 1;
			return -1;
		},
		[visible],
	);

	return {
		visible,
		expanded,
		indexOf,
		expand,
		collapse,
		toggle,
		isExpanded,
		setExpansion,
		getExpandedPaths,
		parentOf,
		firstChildIndexAfter,
	};
}

export const treeUtils = {
	stripTrailing,
	basename,
	parentPathOf,
	depthOf,
};
