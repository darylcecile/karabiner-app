import { useEffect, useState } from 'react';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useRagStatus } from '@/renderer/hooks/useRagStatus';
import { main } from '@/renderer/relay';
import { cn } from '@/shared/utils';

const READY_FADE_MS = 30_000;

function truncateMiddle(input: string, max = 48): string {
	if (input.length <= max) return input;
	const head = Math.ceil(max / 2) - 1;
	const tail = Math.floor(max / 2) - 2;
	return `${input.slice(0, head)}…${input.slice(-tail)}`;
}

export function IndexingStatusFooter() {
	const { status } = useRagStatus();
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (status.state !== 'ready') return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [status.state]);

	if (status.state === 'idle' && status.indexed === 0) return null;

	if (status.state === 'ready') {
		const last = status.lastRunAt ?? 0;
		if (last && now - last > READY_FADE_MS) return null;
	}

	const pct = status.total > 0
		? Math.min(100, Math.max(0, (status.indexed / status.total) * 100))
		: 0;

	return (
		<div
			className={cn(
				'pointer-events-auto absolute bottom-2 left-2 z-30',
				'flex items-center gap-2 rounded-full border border-foreground/10',
				'bg-foreground/5 backdrop-blur-sm px-2.5 py-1 text-xs text-foreground/70',
				'shadow-sm',
			)}
		>
			{status.state === 'loading-model' && (
				<>
					<Spinner className="size-3" />
					<span>Loading embedding model…</span>
				</>
			)}

			{status.state === 'indexing' && (
				<>
					<Spinner className="size-3" />
					<span className="tabular-nums">
						Indexing {status.indexed} / {status.total}
					</span>
					<div className="h-1 w-20 overflow-hidden rounded-full bg-foreground/10">
						<div
							className="h-full bg-foreground/50 transition-[width] duration-200"
							style={{ width: `${pct}%` }}
						/>
					</div>
					{status.currentFile && (
						<span className="max-w-[180px] truncate text-foreground/50">
							{truncateMiddle(status.currentFile)}
						</span>
					)}
				</>
			)}

			{status.state === 'ready' && (
				<>
					<span className="inline-block size-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-400" aria-hidden />
					<span>Indexed {status.indexed} files</span>
				</>
			)}

			{status.state === 'error' && (
				<>
					<span className="inline-block size-2 rounded-full bg-red-500" aria-hidden />
					<span className="max-w-[240px] truncate">
						{status.errorMessage ?? 'Indexing failed'}
					</span>
					<button
						type="button"
						onClick={() => { (main as any).ragStartIndexing().catch(() => {}); }}
						className="rounded px-1.5 py-0.5 text-foreground/80 hover:bg-foreground/10"
					>
						Retry
					</button>
				</>
			)}
		</div>
	);
}
