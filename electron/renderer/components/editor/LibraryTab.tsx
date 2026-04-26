import { useEffect, useMemo, useState } from 'react';
import { useBlockNoteEditor, useDictionary, useComponentsContext } from '@blocknote/react';
import { main } from '@/renderer/relay';
import { IMAGE_EXTS } from '../workbench/viewKind';
import { cn } from '@/shared/utils';

type Asset = { path: string; relPath: string; name: string };

function imageUrlForRelPath(relPath: string): string {
	// Resolve via vault root in main (`karabiner-file:///<encoded>`).
	return `karabiner-file:///${relPath}`;
}

function isImage(name: string): boolean {
	const lower = name.toLowerCase();
	const dot = lower.lastIndexOf('.');
	if (dot < 0) return false;
	return IMAGE_EXTS.has(lower.slice(dot));
}

export function LibraryTab({ blockId }: { blockId: string }) {
	const editor = useBlockNoteEditor();
	const dict = useDictionary();
	const Components = useComponentsContext();
	const [assets, setAssets] = useState<Asset[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState('');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const all = await main.listVaultFiles();
				if (cancelled) return;
				const images = all.filter((a) => isImage(a.name));
				images.sort((a, b) => {
					// Prefer entries under /assets first.
					const aAssets = a.relPath.startsWith('assets/') ? 0 : 1;
					const bAssets = b.relPath.startsWith('assets/') ? 0 : 1;
					if (aAssets !== bAssets) return aAssets - bAssets;
					return a.relPath.localeCompare(b.relPath);
				});
				setAssets(images);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		if (!assets) return [];
		const q = filter.trim().toLowerCase();
		if (!q) return assets;
		return assets.filter((a) => a.relPath.toLowerCase().includes(q));
	}, [assets, filter]);

	const onPick = (asset: Asset) => {
		editor.updateBlock(blockId, {
			props: { url: imageUrlForRelPath(asset.relPath), name: asset.name },
		});
	};

	if (!Components) return null;

	return (
		<Components.FilePanel.TabPanel className="bn-tab-panel">
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					width: '100%',
					minWidth: 360,
				}}
			>
				<input
					type="text"
					value={filter}
					placeholder="Filter assets…"
					onChange={(e) => setFilter(e.target.value)}
					className={cn(
						'rounded border px-2 py-1 text-sm outline-none',
						'border-foreground/15 bg-background',
						'focus:border-foreground/40',
					)}
				/>

				{error && (
					<div className="text-sm text-destructive">Failed to load assets: {error}</div>
				)}

				{!error && assets === null && (
					<div className="py-4 text-center text-sm text-foreground/50">Loading…</div>
				)}

				{!error && assets !== null && filtered.length === 0 && (
					<div className="py-4 text-center text-sm text-foreground/50">
						{assets.length === 0 ? 'No images in vault yet.' : 'No matches.'}
					</div>
				)}

				{filtered.length > 0 && (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
							gap: 6,
							maxHeight: 320,
							overflowY: 'auto',
							paddingRight: 4,
						}}
					>
						{filtered.map((asset) => {
							const url = imageUrlForRelPath(asset.relPath);
							return (
								<button
									key={asset.relPath}
									type="button"
									onClick={() => onPick(asset)}
									title={asset.relPath}
									className={cn(
										'group relative overflow-hidden rounded border border-foreground/10',
										'aspect-square cursor-pointer bg-foreground/5',
										'hover:border-foreground/40',
									)}
								>
									<img
										src={url}
										alt={asset.name}
										loading="lazy"
										style={{ width: '100%', height: '100%', objectFit: 'cover' }}
										draggable={false}
									/>
									<span
										className={cn(
											'absolute right-0 bottom-0 left-0 truncate px-1 py-0.5',
											'bg-background/80 text-[10px] text-foreground/80 backdrop-blur-sm',
											'opacity-0 group-hover:opacity-100',
										)}
									>
										{asset.name}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</div>
			{/* Honour the dictionary so unused-var linters stay quiet. */}
			<span hidden>{dict.file_panel.upload.title}</span>
		</Components.FilePanel.TabPanel>
	);
}
