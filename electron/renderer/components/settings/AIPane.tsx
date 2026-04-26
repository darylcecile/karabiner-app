import { useEffect, useState } from 'react';
import { main } from '../../relay';
import { cn } from '@/shared/utils';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';
import { Spinner } from '../ui/spinner';
import { Input } from '../ui/input';
import { useRagStatus } from '@/renderer/hooks/useRagStatus';

type ProviderId = 'none' | 'auto' | 'claude' | 'copilot' | 'openai' | 'ollama';

type Availability = {
	claude: boolean;
	copilot: boolean;
	openai: boolean;
	ollama: boolean;
};

type Option = {
	id: ProviderId;
	label: string;
	description: string;
	requires?: keyof Availability;
};

const OPTIONS: Option[] = [
	{ id: 'none', label: 'None', description: "Don't use AI" },
	{ id: 'auto', label: 'Automatic', description: 'Use the first available provider' },
	{ id: 'claude', label: 'Claude (CLI)', description: 'Use the locally installed Claude CLI', requires: 'claude' },
	{ id: 'copilot', label: 'Copilot SDK', description: 'Use the GitHub Copilot SDK', requires: 'copilot' },
	{ id: 'openai', label: 'OpenAI (BYOK)', description: 'Bring your own OpenAI-compatible API key', requires: 'openai' },
	{ id: 'ollama', label: 'Ollama (local)', description: 'Use a locally running Ollama server', requires: 'ollama' },
];

function activeName(value: ProviderId, availability: Availability | null): string {
	if (value === 'none') return 'None';
	if (value === 'claude') return 'Claude (CLI)';
	if (value === 'copilot') return 'Copilot SDK';
	if (value === 'openai') return 'OpenAI (BYOK)';
	if (value === 'ollama') return 'Ollama (local)';
	if (value === 'auto') {
		if (availability?.claude) return 'Automatic — Claude (CLI)';
		if (availability?.copilot) return 'Automatic — Copilot SDK';
		if (availability?.ollama) return 'Automatic — Ollama (local)';
		if (availability?.openai) return 'Automatic — OpenAI (BYOK)';
		return 'Automatic — none detected';
	}
	return value;
}

const EMPTY_AVAILABILITY: Availability = { claude: false, copilot: false, openai: false, ollama: false };

export function AIPane() {
	const [availability, setAvailability] = useState<Availability | null>(null);
	const [value, setValue] = useState<ProviderId>('auto');
	const [loading, setLoading] = useState(true);
	const [availabilityNonce, setAvailabilityNonce] = useState(0);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [avail, current] = await Promise.all([
					(main as any).aiAvailability() as Promise<Availability>,
					main.preferences('ai.provider') as Promise<ProviderId | undefined>,
				]);
				if (cancelled) return;
				setAvailability(avail ?? EMPTY_AVAILABILITY);
				setValue((current as ProviderId | undefined) ?? 'auto');
			} catch {
				if (!cancelled) {
					setAvailability(EMPTY_AVAILABILITY);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [availabilityNonce]);

	async function select(next: ProviderId) {
		setValue(next);
		try {
			await main.preferences('ai.provider', next);
		} catch {
			// no-op; keep optimistic UI
		}
	}

	function refreshAvailability() {
		setAvailabilityNonce((n) => n + 1);
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
					const isConfigurable = opt.id === 'openai' || opt.id === 'ollama';
					const disabled = opt.requires ? !detected && !isConfigurable : false;
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
											{isConfigurable ? 'Not configured' : 'Not detected'}
										</span>
									)}
								</span>
								<span className="text-xs text-foreground/60">{opt.description}</span>
							</span>
						</button>
					);
				})}
			</div>

			<OpenAISection visible={value === 'openai' || value === 'auto'} onChange={refreshAvailability} />
			<OllamaSection visible={value === 'ollama' || value === 'auto'} onChange={refreshAvailability} />

			<Separator />

			<AIFeaturesSection availability={availability} provider={value} />

			<Separator />

			<AskModeSection availability={availability} provider={value} />

			<Separator />

			<div className="text-xs text-foreground/60">
				Active: <span className="text-foreground/80">{activeName(value, availability)}</span>
			</div>

			<Separator />

			<IndexingSection />
		</div>
	);
}

function ConfigField({
	label,
	value,
	onChange,
	type = 'text',
	placeholder,
	disabled,
	monospace,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
	type?: 'text' | 'password';
	placeholder?: string;
	disabled?: boolean;
	monospace?: boolean;
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-xs font-medium text-foreground/70">{label}</span>
			<Input
				type={type}
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
				className={cn('text-xs', monospace && 'font-mono')}
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
			/>
		</label>
	);
}

function OpenAISection({ visible, onChange }: { visible: boolean; onChange: () => void }) {
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('gpt-4o-mini');
	const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
	const [showKey, setShowKey] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const cfg = (await main.preferences('ai.openai')) as
					| { apiKey?: string; model?: string; baseUrl?: string }
					| undefined;
				if (cancelled) return;
				setApiKey(cfg?.apiKey ?? '');
				setModel(cfg?.model ?? 'gpt-4o-mini');
				setBaseUrl(cfg?.baseUrl ?? 'https://api.openai.com/v1');
			} catch {
				/* keep defaults */
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function commit(key: string, val: string) {
		try {
			await main.preferences(`ai.openai.${key}`, val);
			onChange();
		} catch {
			/* keep optimistic */
		}
	}

	if (!visible) return null;

	return (
		<div className="flex flex-col gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">OpenAI configuration</h3>
				<span className="text-2xs text-foreground/50">Stored in plain text</span>
			</div>
			<ConfigField
				label="API key"
				type={showKey ? 'text' : 'password'}
				value={apiKey}
				onChange={(v) => setApiKey(v)}
				placeholder="sk-…"
				disabled={loading}
				monospace
			/>
			<div className="flex items-center justify-between gap-2 -mt-1">
				<button
					type="button"
					className="text-2xs text-foreground/60 hover:text-foreground/80"
					onClick={() => setShowKey((s) => !s)}
				>
					{showKey ? 'Hide' : 'Show'} key
				</button>
				<button
					type="button"
					className="text-2xs text-foreground/60 hover:text-foreground/80"
					onClick={() => commit('apiKey', apiKey)}
				>
					Save key
				</button>
			</div>
			<ConfigField
				label="Model"
				value={model}
				onChange={(v) => {
					setModel(v);
					void commit('model', v);
				}}
				placeholder="gpt-4o-mini"
				disabled={loading}
				monospace
			/>
			<ConfigField
				label="Base URL"
				value={baseUrl}
				onChange={(v) => {
					setBaseUrl(v);
					void commit('baseUrl', v);
				}}
				placeholder="https://api.openai.com/v1"
				disabled={loading}
				monospace
			/>
			<p className="text-2xs text-foreground/50">
				Use a custom base URL for OpenAI-compatible providers (Azure, Together, OpenRouter…).
			</p>
		</div>
	);
}

function OllamaSection({ visible, onChange }: { visible: boolean; onChange: () => void }) {
	const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
	const [model, setModel] = useState('llama3.2');
	const [loading, setLoading] = useState(true);
	const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const cfg = (await main.preferences('ai.ollama')) as
					| { baseUrl?: string; model?: string }
					| undefined;
				if (cancelled) return;
				setBaseUrl(cfg?.baseUrl ?? 'http://localhost:11434');
				setModel(cfg?.model ?? 'llama3.2');
			} catch {
				/* keep defaults */
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function commit(key: string, val: string) {
		try {
			await main.preferences(`ai.ollama.${key}`, val);
			onChange();
		} catch {
			/* keep optimistic */
		}
	}

	async function testConnection() {
		setTestState('testing');
		try {
			const url = baseUrl.replace(/\/$/, '') + '/api/tags';
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 2000);
			const resp = await fetch(url, { signal: ctrl.signal });
			clearTimeout(t);
			setTestState(resp.ok ? 'ok' : 'fail');
		} catch {
			setTestState('fail');
		}
	}

	if (!visible) return null;

	return (
		<div className="flex flex-col gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
			<h3 className="text-sm font-semibold">Ollama configuration</h3>
			<ConfigField
				label="Base URL"
				value={baseUrl}
				onChange={(v) => {
					setBaseUrl(v);
					void commit('baseUrl', v);
				}}
				placeholder="http://localhost:11434"
				disabled={loading}
				monospace
			/>
			<ConfigField
				label="Model"
				value={model}
				onChange={(v) => {
					setModel(v);
					void commit('model', v);
				}}
				placeholder="llama3.2"
				disabled={loading}
				monospace
			/>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={testConnection}
					disabled={testState === 'testing'}
					className={cn(
						'rounded-md border border-foreground/15 px-2.5 py-1 text-xs',
						'hover:bg-foreground/5 transition-colors disabled:opacity-50',
					)}
				>
					{testState === 'testing' ? 'Testing…' : 'Test connection'}
				</button>
				{testState === 'ok' && <span className="text-xs text-emerald-500">Reachable</span>}
				{testState === 'fail' && <span className="text-xs text-red-500">Unreachable</span>}
			</div>
		</div>
	);
}

function AIFeaturesSection({
	availability,
	provider,
}: {
	availability: Availability | null;
	provider: ProviderId;
}) {
	const aiActive =
		provider !== 'none' &&
		Boolean(
			availability &&
				(availability.claude || availability.copilot || availability.openai || availability.ollama),
		);

	const [labelGen, setLabelGen] = useState<boolean>(true);
	const [searchEnabled, setSearchEnabled] = useState<boolean>(true);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [lg, se] = await Promise.all([
					main.preferences('ai.labelGeneration') as Promise<boolean | undefined>,
					main.preferences('ai.searchEnabled') as Promise<boolean | undefined>,
				]);
				if (cancelled) return;
				setLabelGen(lg !== false);
				setSearchEnabled(se !== false);
			} catch {
				/* keep defaults */
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function toggleLabelGen(next: boolean) {
		setLabelGen(next);
		try {
			await main.preferences('ai.labelGeneration', next);
		} catch {
			/* keep optimistic */
		}
	}

	async function toggleSearchEnabled(next: boolean) {
		setSearchEnabled(next);
		try {
			await main.preferences('ai.searchEnabled', next);
		} catch {
			/* keep optimistic */
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-col gap-0.5 mb-1">
				<h3 className="text-sm font-semibold">AI features</h3>
				<p className="text-xs text-foreground/60">
					{aiActive
						? 'Toggle individual AI-powered capabilities. Indexing and keyword search keep working when these are off.'
						: 'These options take effect once an AI provider is selected and detected.'}
				</p>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Label generation</span>
					<span className="text-xs text-foreground/60">
						Use AI to generate file emoji, labels, and categories.
					</span>
				</div>
				<Switch
					checked={aiActive && labelGen}
					onCheckedChange={toggleLabelGen}
					disabled={loading || !aiActive}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Semantic search</span>
					<span className="text-xs text-foreground/60">
						Use vector embeddings for search. When off, search uses keyword + fuzzy matching only.
					</span>
				</div>
				<Switch
					checked={aiActive && searchEnabled}
					onCheckedChange={toggleSearchEnabled}
					disabled={loading || !aiActive}
				/>
			</div>
		</div>
	);
}

type AskModePrefs = {
	enabled: boolean;
	autoDetect: boolean;
	showAnswer: boolean;
	showResults: boolean;
};

function AskModeSection({
	availability,
	provider,
}: {
	availability: Availability | null;
	provider: ProviderId;
}) {
	const aiActive =
		provider !== 'none' &&
		Boolean(
			availability &&
				(availability.claude || availability.copilot || availability.openai || availability.ollama),
		);

	const [prefs, setPrefs] = useState<AskModePrefs>({
		enabled: true,
		autoDetect: true,
		showAnswer: true,
		showResults: true,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const raw = (await main.preferences('ai.askMode')) as Partial<AskModePrefs> | undefined;
				if (cancelled) return;
				if (raw) {
					setPrefs({
						enabled: raw.enabled !== false,
						autoDetect: raw.autoDetect !== false,
						showAnswer: raw.showAnswer !== false,
						showResults: raw.showResults !== false,
					});
				}
			} catch {
				/* keep defaults */
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function update(patch: Partial<AskModePrefs>) {
		const next = { ...prefs, ...patch };
		setPrefs(next);
		try {
			await Promise.all(
				Object.entries(patch).map(([k, v]) => main.preferences(`ai.askMode.${k}`, v)),
			);
		} catch {
			/* keep optimistic */
		}
	}

	const baseDisabled = loading || !aiActive;
	const subDisabled = baseDisabled || !prefs.enabled;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-col gap-0.5 mb-1">
				<h3 className="text-sm font-semibold">Ask mode</h3>
				<p className="text-xs text-foreground/60">
					Type a natural-language question in search (e.g. "my notes on end of year review") and let
					AI answer using your indexed notes.
				</p>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Enable Ask mode</span>
					<span className="text-xs text-foreground/60">
						Allow questions to be answered with synthesized responses.
					</span>
				</div>
				<Switch
					checked={aiActive && prefs.enabled}
					onCheckedChange={(v) => update({ enabled: v })}
					disabled={baseDisabled}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Auto-detect questions</span>
					<span className="text-xs text-foreground/60">
						Automatically use Ask mode when the query looks like a question.
					</span>
				</div>
				<Switch
					checked={!subDisabled && prefs.autoDetect}
					onCheckedChange={(v) => update({ autoDetect: v })}
					disabled={subDisabled}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Show synthesized answer</span>
					<span className="text-xs text-foreground/60">
						Generate an AI answer with citations from the retrieved notes.
					</span>
				</div>
				<Switch
					checked={!subDisabled && prefs.showAnswer}
					onCheckedChange={(v) => update({ showAnswer: v })}
					disabled={subDisabled}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-foreground/5">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Show retrieved notes</span>
					<span className="text-xs text-foreground/60">
						Display the underlying note chunks alongside the answer.
					</span>
				</div>
				<Switch
					checked={!subDisabled && prefs.showResults}
					onCheckedChange={(v) => update({ showResults: v })}
					disabled={subDisabled}
				/>
			</div>
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
