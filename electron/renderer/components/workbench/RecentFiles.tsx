import { useCallback, useMemo } from 'react';
import { Tree } from '@/renderer/components/tree';
import { useRecentFiles } from '@/renderer/hooks/useRecentFiles';
import { useWorkbench } from './Workbench';
import { getCachedLabel, requestLabel } from '@/renderer/hooks/useFileLabel';

function basename(p: string): string {
	const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
	return idx >= 0 ? p.slice(idx + 1) : p;
}

export function RecentFiles() {
	const { recentFiles } = useRecentFiles();
	const { workspace } = useWorkbench();

	// Key each row by index so duplicate basenames don't collide. The Tree
	// expects flat strings without "/" for top-level files.
	const paths = useMemo(() => recentFiles.map((_, i) => `r${i}`), [recentFiles]);
	const indexFor = useCallback((path: string): number => {
		const n = Number.parseInt(path.replace(/^r/, ''), 10);
		return Number.isFinite(n) ? n : -1;
	}, []);

	const handleActivate = useCallback((path: string) => {
		const idx = indexFor(path);
		const abs = recentFiles[idx];
		if (abs) workspace.openInEditor(abs);
	}, [indexFor, recentFiles, workspace]);

	const renderPrimary = useCallback((ctx: { path: string; kind: 'file' | 'folder' }) => {
		if (ctx.kind !== 'file') return null;
		const abs = recentFiles[indexFor(ctx.path)];
		if (!abs) return null;
		const entry = getCachedLabel(abs);
		if (entry && entry !== 'pending') {
			return <span title={abs}>{entry.label}</span>;
		}
		requestLabel(abs, false);
		return <span title={abs}>{basename(abs)}</span>;
	}, [recentFiles, indexFor]);

	const renderIcon = useCallback((ctx: { path: string; kind: 'file' | 'folder' }) => {
		if (ctx.kind !== 'file') return null;
		const abs = recentFiles[indexFor(ctx.path)];
		if (!abs) return null;
		const entry = getCachedLabel(abs);
		if (entry && entry !== 'pending' && entry.emoji) {
			return (
				<span aria-hidden className="text-[14px] leading-none">
					{entry.emoji}
				</span>
			);
		}
		if (entry === 'pending') {
			return (
				<span
					aria-label="Generating label"
					title="Generating label…"
					className="inline-block size-3 rounded-full border-[1.5px] border-foreground/20 border-t-primary animate-spin"
				/>
			);
		}
		return null;
	}, [recentFiles, indexFor]);

	if (recentFiles.length === 0) {
		return (
			<div className="px-2 py-1 text-2xs text-foreground/40">
				No recent files
			</div>
		);
	}

	return (
		<Tree
			paths={paths}
			onActivate={handleActivate}
			onSelect={handleActivate}
			renderPrimary={renderPrimary}
			renderIcon={renderIcon}
			aria-label="Recent files"
		/>
	);
}

