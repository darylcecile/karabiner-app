import { useEffect, useState } from 'react';
import { main } from '../../relay';
import { cn } from '@/shared/utils';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';
import { Spinner } from '../ui/spinner';
import { useRagStatus } from '@/renderer/hooks/useRagStatus';

type ProviderId = 'none' | 'auto' | 'claude' | 'copilot';

type Availability = {
	claude: boolean;
	copilot: boolean;
};

type Option = {
	id: ProviderId;
	label: string;
	description: string;
	requires?: keyof Availability;
};

const OPTIONS: Option[] = [
	{ id: 'none', label: 'None', description: "Don't use AI" },
	{ id: 'auto', label: 'Automatic', description: 'Use Claude or Copilot if available' },
	{ id: 'claude', label: 'Claude (CLI)', description: 'Use the locally installed Claude CLI', requires: 'claude' },
	{ id: 'copilot', label: 'Copilot SDK', description: 'Use the GitHub Copilot SDK', requires: 'copilot' },
];

function activeName(value: ProviderId, availability: Availability | null): string {
	if (value === 'none') return 'None';
	if (value === 'claude') return 'Claude (CLI)';
	if (value === 'copilot') return 'Copilot SDK';
	if (value === 'auto') {
		if (availability?.claude) return 'Automatic — Claude (CLI)';
		if (availability?.copilot) return 'Automatic — Copilot SDK';
		return 'Automatic — none detected';
	}
	return value;
}

export function AIPane() {
	const [availability, setAvailability] = useState<Availability | null>(null);
	const [value, setValue] = useState<ProviderId>('auto');
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [avail, current] = await Promise.all([
					(main as any).aiAvailability() as Promise<Availability>,
					main.preferences('ai.provider') as Promise<ProviderId | undefined>,
				]);
				if (cancelled) return;
				setAvailability(avail ?? { claude: false, copilot: false });
				setValue((current as ProviderId | undefined) ?? 'auto');
			} catch {
				if (!cancelled) {
					setAvailability({ claude: false, copilot: false });
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function select(next: ProviderId) {
		setValue(next);
		try {
			await main.preferences('ai.provider', next);
		} catch {
			// no-op; keep optimistic UI
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="text-base font-semibold">AI</h2>
				<p className="text-sm text-foreground/60">
					Choose how the app uses AI. Providers are detected automatically based on what's installed.
				</p>
			</div>

			<Separator />

			<div role="radiogroup" aria-label="AI provider" className="flex flex-col gap-1">
				{OPTIONS.map((opt) => {
					const detected = opt.requires ? availability?.[opt.requires] === true : true;
					const disabled = opt.requires ? !detected : false;
					const selected = value === opt.id;
					return (
						<button
							key={opt.id}
							type="button"
							role="radio"
							aria-checked={selected}
							disabled={disabled || loading}
							onClick={() => select(opt.id)}
							className={cn(
								'flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
								selected
									? 'border-primary/40 bg-primary/5'
									: 'border-transparent hover:bg-foreground/5',
								disabled && 'opacity-50 cursor-not-allowed'
							)}
						>
							<span
								className={cn(
									'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
									selected ? 'border-primary' : 'border-foreground/30'
								)}
							>
								{selected && <span className="h-2 w-2 rounded-full bg-primary" />}
							</span>
							<span className="flex flex-1 flex-col gap-0.5">
								<span className="flex items-center gap-2 text-sm font-medium">
									{opt.label}
									{opt.requires && !detected && (
										<span className="rounded-sm bg-foreground/10 px-1.5 py-0.5 text-2xs font-normal text-foreground/60">
											Not detected
										</span>
									)}
								</span>
								<span className="text-xs text-foreground/60">{opt.description}</span>
							</span>
						</button>
					);
				})}
			</div>

			<Separator />

			<div className="text-xs text-foreground/60">
				Active: <span className="text-foreground/80">{activeName(value, availability)}</span>
			</div>

			<Separator />

			<IndexingSection />
		</div>
	);
}

function stateLabel(state: string): string {
	switch (state) {
		case 'idle': return 'Idle';
		case 'loading-model': return 'Loading model…';
		case 'indexing': return 'Indexing…';
		case 'ready': return 'Ready';
		case 'error': return 'Error';
		default: return state;
	}
}

function IndexingSection() {
	const { status, start } = useRagStatus();
	const [autoIndex, setAutoIndex] = useState<boolean>(true);
	const [autoLoading, setAutoLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(main as any).ragGetAutoIndex().then((v: boolean) => {
			if (!cancelled) setAutoIndex(Boolean(v));
		}).catch(() => {}).finally(() => {
			if (!cancelled) setAutoLoading(false);
		});
		return () => { cancelled = true; };
	}, []);

	async function toggleAutoIndex(next: boolean) {
		setAutoIndex(next);
		try {
			await (main as any).ragSetAutoIndex(next);
		} catch {
			// keep optimistic state
		}
	}

	const isIndexing = status.state === 'indexing' || status.state === 'loading-model';
	const pct = status.total > 0
		? Math.min(100, Math.max(0, (status.indexed / status.total) * 100))
		: 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="text-base font-semibold">Indexing</h2>
				<p className="text-sm text-foreground/60">
					Builds a local search index over your notes for fast retrieval.
				</p>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Auto-index on launch</span>
					<span className="text-xs text-foreground/60">
						Automatically build the index when the app starts.
					</span>
				</div>
				<Switch
					checked={autoIndex}
					onCheckedChange={toggleAutoIndex}
					disabled={autoLoading}
				/>
			</div>

			<div className="flex flex-col gap-2 rounded-md px-3 py-2.5 border border-foreground/10">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-sm">
						{isIndexing && <Spinner className="size-3.5" />}
						{status.state === 'ready' && (
							<span className="inline-block size-2 rounded-full bg-emerald-500" aria-hidden />
						)}
						{status.state === 'error' && (
							<span className="inline-block size-2 rounded-full bg-red-500" aria-hidden />
						)}
						<span className="font-medium">{stateLabel(status.state)}</span>
						{status.state === 'indexing' && (
							<span className="tabular-nums text-foreground/60">
								{status.indexed} / {status.total}
							</span>
						)}
					</div>
					<button
						type="button"
						onClick={start}
						disabled={isIndexing}
						className={cn(
							'rounded-md border border-foreground/15 px-2.5 py-1 text-xs',
							'hover:bg-foreground/5 transition-colors',
							isIndexing && 'opacity-50 cursor-not-allowed',
						)}
					>
						Reindex now
					</button>
				</div>

				{isIndexing && (
					<div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
						<div
							className="h-full bg-foreground/50 transition-[width] duration-200"
							style={{ width: `${pct}%` }}
						/>
					</div>
				)}

				{status.state === 'error' && status.errorMessage && (
					<p className="text-xs text-red-500">{status.errorMessage}</p>
				)}

				{status.lastRunAt ? (
					<p className="text-xs text-foreground/60">
						Last indexed: <span className="text-foreground/80">{new Date(status.lastRunAt).toLocaleString()}</span>
					</p>
				) : null}
			</div>
		</div>
	);
}
