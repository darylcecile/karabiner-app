import { useRecentFiles } from '@/renderer/hooks/useRecentFiles';
import { useWorkbench } from './Workbench';
import { cn } from '@/shared/utils';

function basename(p: string): string {
	const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
	return idx >= 0 ? p.slice(idx + 1) : p;
}

export function RecentFiles() {
	const { recentFiles, clearRecents } = useRecentFiles();
	const { workspace } = useWorkbench();

	if (recentFiles.length === 0) {
		return (
			<div className="px-2 py-1 text-2xs text-foreground/40">
				No recent files
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0.5 pt-1">
			{recentFiles.map((path) => (
				<button
					key={path}
					title={path}
					onClick={() => workspace.openInEditor(path)}
					className={cn(
						'flex items-center gap-1 px-2 py-0.5 text-xs text-left rounded',
						'text-foreground/80 hover:bg-foreground/5 truncate',
					)}
				>
					<span className="truncate">{basename(path)}</span>
				</button>
			))}
			<button
				onClick={() => void clearRecents()}
				className="mt-1 px-2 py-0.5 text-2xs text-left text-foreground/45 hover:text-foreground/70"
			>
				Clear recent
			</button>
		</div>
	);
}
