import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { main } from '../../relay';
import { cn } from '@/shared/utils';
import type { SearchResponse, SearchResult } from '@/main/rag/search';
import { usePrefersColorScheme } from '@/renderer/hooks/usePrefersColorScheme';

type SearchState =
	| { kind: 'idle' }
	| { kind: 'loading'; previousResponse?: SearchResponse }
	| { kind: 'results'; response: SearchResponse }
	| { kind: 'error'; message: string; previousResponse?: SearchResponse };

const DEBOUNCE_MS = 150;
const RESULT_LIMIT = 25;

function stripMdExt(name: string): string {
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

function basename(p: string): string {
	const ix = p.lastIndexOf('/');
	return ix === -1 ? p : p.slice(ix + 1);
}

function dirname(p: string): string {
	const ix = p.lastIndexOf('/');
	return ix <= 0 ? '' : p.slice(0, ix);
}

function buildParentLabel(absPath: string, vaultRoot: string): string {
	const dir = dirname(absPath);
	if (!dir) return '';
	let rel = dir;
	if (vaultRoot && rel.startsWith(vaultRoot)) {
		rel = rel.slice(vaultRoot.length);
		if (rel.startsWith('/')) rel = rel.slice(1);
	}
	if (!rel) return '';
	const segs = rel.split('/').filter(Boolean);
	if (segs.length <= 2) return segs.join('/');
	return `…/${segs.slice(-2).join('/')}`;
}

function sourceLabel(source: SearchResponse['source'], count: number): string {
	if (count === 0 && source !== 'ask') return 'No matches';
	if (source === 'vector') return 'Semantic';
	if (source === 'ask') return 'Asked';
	return 'Keyword';
}

function sourceBadge(source: SearchResponse['source']): { label: string; className: string; title: string } {
	if (source === 'vector') {
		return {
			label: 'Semantic',
			title: 'Result ranked by vector embedding similarity',
			className: 'bg-primary/5 text-primary',
		};
	}
	if (source === 'ask') {
		return {
			label: 'Cited',
			title: 'Retrieved as supporting context for the answer',
			className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
		};
	}
	return {
		label: 'Keyword',
		title: 'Result matched via grep + fuzzy ranking (no embedding match)',
		className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
	};
}

function stripQueryPrefix(q: string): { text: string; forced: boolean } {
	const trimmed = q.trimStart();
	if (trimmed.startsWith('?')) return { text: trimmed.slice(1).trimStart(), forced: true };
	return { text: q, forced: false };
}

export default function SearchApp() {
	const [query, setQuery] = useState('');
	const [forceAsk, setForceAsk] = useState(false);
	const [state, setState] = useState<SearchState>({ kind: 'idle' });
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);
	const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
	const requestSeqRef = useRef(0);
	const escapePressedRef = useRef(false);
	const idPrefix = useId();
	const theme = usePrefersColorScheme();

	const vaultRoot = useMemo<string>(() => {
		try {
			const home = main.querySync('homeDir') as string;
			return home ? `${home}/.karabiner/vault` : '';
		} catch {
			return '';
		}
	}, []);

	const results: SearchResult[] = (() => {
		if (state.kind === 'results') return state.response.results;
		if (state.kind === 'loading' && state.previousResponse) return state.previousResponse.results;
		if (state.kind === 'error' && state.previousResponse) return state.previousResponse.results;
		return [];
	})();

	const resultsSource: SearchResponse['source'] | null = (() => {
		if (state.kind === 'results') return state.response.source;
		if (state.kind === 'loading' && state.previousResponse) return state.previousResponse.source;
		if (state.kind === 'error' && state.previousResponse) return state.previousResponse.source;
		return null;
	})();

	const currentResponse: SearchResponse | null = (() => {
		if (state.kind === 'results') return state.response;
		if (state.kind === 'loading' && state.previousResponse) return state.previousResponse;
		if (state.kind === 'error' && state.previousResponse) return state.previousResponse;
		return null;
	})();

	const answer = currentResponse?.answer ?? null;
	const queryHasAskPrefix = query.trimStart().startsWith('?');
	const askIndicatorActive = forceAsk || queryHasAskPrefix || resultsSource === 'ask';

	const isLoading = state.kind === 'loading';

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select?.();
	}, []);

	useEffect(() => {
		const off = window.karabinerEvents.on('search:focus-input', () => {
			setQuery('');
			setForceAsk(false);
			setState({ kind: 'idle' });
			setActiveIndex(0);
			escapePressedRef.current = false;
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select?.();
			});
		});
		return () => {
			off();
		};
	}, []);

	useEffect(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			requestSeqRef.current += 1;
			setState({ kind: 'idle' });
			setActiveIndex(0);
			return;
		}

		const { text: cleaned, forced: prefixForced } = stripQueryPrefix(trimmed);
		const askRequested = forceAsk || prefixForced;
		const queryToSend = cleaned.length > 0 ? cleaned : trimmed;

		const mySeq = ++requestSeqRef.current;
		// Enter loading state immediately, preserving prior results so the list
		// stays visible (dimmed) while we debounce + fetch.
		setState((prev) => {
			const carry =
				prev.kind === 'results'
					? prev.response
					: 'previousResponse' in prev
						? prev.previousResponse
						: undefined;
			return { kind: 'loading', previousResponse: carry };
		});

		const timer = window.setTimeout(async () => {
			if (mySeq !== requestSeqRef.current) return;
			try {
				const response = (await main.ragSearch(queryToSend, {
					limit: RESULT_LIMIT,
					forceAsk: askRequested,
				})) as SearchResponse;
				if (mySeq !== requestSeqRef.current) return;
				setState({ kind: 'results', response });
				setActiveIndex(0);
			} catch (err) {
				if (mySeq !== requestSeqRef.current) return;
				const message = err instanceof Error ? err.message : 'Search failed';
				setState((prev) => ({
					kind: 'error',
					message,
					previousResponse:
						prev.kind === 'results'
							? prev.response
							: 'previousResponse' in prev
								? prev.previousResponse
								: undefined,
				}));
			}
		}, DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timer);
		};
	}, [query, forceAsk]);

	useEffect(() => {
		const el = itemRefs.current[activeIndex];
		if (el) el.scrollIntoView({ block: 'nearest' });
	}, [activeIndex, results.length]);

	const closeWindow = useCallback(() => {
		try {
			(main as unknown as { searchHide?: () => void }).searchHide?.();
		} catch {
			/* noop */
		}
	}, []);

	const activate = useCallback(
		(idx: number) => {
			const item = results[idx];
			if (!item) return;
			try {
				const fn = (main as unknown as { searchOpenFile?: (p: string) => Promise<boolean> }).searchOpenFile;
				if (fn) void fn(item.path);
			} catch {
				/* noop */
			}
		},
		[results],
	);

	const onInputKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Tab') {
				e.preventDefault();
				setForceAsk((v) => !v);
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (results.length === 0) return;
				setActiveIndex((i) => Math.min(results.length - 1, i + 1));
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (results.length === 0) return;
				setActiveIndex((i) => Math.max(0, i - 1));
				return;
			}
			if (e.key === 'Home') {
				if (results.length === 0) return;
				e.preventDefault();
				setActiveIndex(0);
				return;
			}
			if (e.key === 'End') {
				if (results.length === 0) return;
				e.preventDefault();
				setActiveIndex(results.length - 1);
				return;
			}
			if (e.key === 'Enter') {
				if (results.length === 0) return;
				e.preventDefault();
				activate(activeIndex);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				if (query.length > 0 && !escapePressedRef.current) {
					escapePressedRef.current = true;
					setQuery('');
					setForceAsk(false);
					setState({ kind: 'idle' });
					setActiveIndex(0);
					closeWindow();
					return;
				}
				closeWindow();
				return;
			}
			escapePressedRef.current = false;
		},
		[activate, activeIndex, closeWindow, query.length, results.length],
	);

	const activeId = results.length > 0 ? `${idPrefix}-result-${activeIndex}` : undefined;

	const footerLeft = (() => {
		if (state.kind === 'error') {
			return <span className="text-destructive/80">Error: {state.message}</span>;
		}
		if (state.kind === 'idle') {
			return <span>Type to search your notes</span>;
		}
		if (state.kind === 'loading') {
			return <span>Searching…</span>;
		}
		const count = state.response.results.length;
		const label = sourceLabel(state.response.source, count);
		return (
			<span className="flex items-center gap-1.5">
				<span>
					{count} {count === 1 ? 'result' : 'results'} · {label}
				</span>
				{state.response.reason ? (
					<span className="text-foreground/40">— {state.response.reason}</span>
				) : null}
			</span>
		);
	})();

	const showEmptyState = state.kind === 'idle';
	const showNoResults =
		state.kind === 'results' &&
		state.response.results.length === 0 &&
		!state.response.answer &&
		query.trim().length > 0;
	const showStaleListLoading = isLoading && results.length > 0;
	const showLoadingPlaceholder = isLoading && results.length === 0;

	return (
		<div 
			className={cn(
				"h-screen w-screen overflow-hidden flex flex-col text-foreground bg-foreground/[0.02] backdrop-saturate-150 select-none",
				theme === "dark" && "dark"
			)}
			>
			<div
				style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
				className="h-9 px-3 flex items-center gap-2 border-b border-foreground/10 relative"
			>
				{state.kind === 'loading' ? (
					<HugeiconsIcon
						icon={Search01Icon}
						strokeWidth={1.75}
						width={16}
						height={16}
						className="text-primary shrink-0 animate-pulse"
						aria-hidden
					/>
				) : (
					<HugeiconsIcon
						icon={Search01Icon}
						strokeWidth={1.75}
						width={16}
						height={16}
						className="text-foreground/50 shrink-0"
					/>
				)}
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={onInputKeyDown}
					placeholder="Search notes…"
					autoFocus
					spellCheck={false}
					autoCorrect="off"
					autoCapitalize="off"
					role="combobox"
					aria-expanded={results.length > 0}
					aria-controls={`${idPrefix}-results`}
					aria-autocomplete="list"
					aria-activedescendant={activeId}
					style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
					className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-foreground/40 focus-visible:ring-0"
				/>
				{askIndicatorActive ? (
					<span
						title={
							forceAsk
								? 'Ask mode forced (Tab to toggle off)'
								: queryHasAskPrefix
									? 'Ask mode forced via "?" prefix'
									: 'Ask mode active for this query'
						}
						style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
						className="text-2xs px-1.5 py-0.5 rounded-sm font-medium tracking-wide shrink-0 bg-purple-500/15 text-purple-600 dark:text-purple-400"
					>
						Ask
					</span>
				) : null}
				{state.kind === 'loading' ? (
					<span
						aria-label="Searching"
						role="status"
						className="size-4 rounded-full border-2 border-foreground/20 border-t-primary animate-spin shrink-0"
					/>
				) : null}
				<span
					style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
					className="text-2xs text-foreground/40 font-medium tracking-wide shrink-0"
				>
					⌘K
				</span>
				{isLoading ? (
					<span
						aria-hidden
						className="pointer-events-none absolute left-0 right-0 bottom-0 h-px overflow-hidden"
					>
						<span className="block h-full w-1/3 bg-primary/70 animate-search-progress" />
					</span>
				) : null}
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
				{showEmptyState ? (
					<div className="h-full flex items-center justify-center text-foreground/40 text-xs px-6 text-center">
						<span>Type to search your notes by content or filename.</span>
					</div>
				) : null}

				{showNoResults ? (
					<div className="h-full flex flex-col items-center justify-center text-foreground/50 text-xs px-6 text-center gap-1">
						<span className="text-foreground/70">No matches</span>
						<span className="text-foreground/40 truncate max-w-full">for "{query.trim()}"</span>
					</div>
				) : null}

				{state.kind === 'error' ? (
					<div className="h-full flex items-center justify-center text-destructive/80 text-xs px-6 text-center">
						<span>{state.message}</span>
					</div>
				) : null}

				{showLoadingPlaceholder ? (
					<div className="h-full flex flex-col items-center justify-center text-foreground/50 text-xs px-6 text-center gap-2">
						<span
							aria-hidden
							className="size-5 rounded-full border-2 border-foreground/15 border-t-primary animate-spin"
						/>
						<span>Searching…</span>
					</div>
				) : null}

				{answer ? (
					<div className="mx-1.5 my-1.5 px-3 py-2.5 rounded-md border border-purple-500/20 bg-purple-500/5 flex flex-col gap-1.5">
						<div className="flex items-center gap-2">
							<span className="text-2xs px-1.5 py-0.5 rounded-sm font-medium tracking-wide bg-purple-500/15 text-purple-600 dark:text-purple-400">
								Answer
							</span>
							{currentResponse?.rewrittenQueries && currentResponse.rewrittenQueries.length > 0 ? (
								<span className="text-2xs text-foreground/40 truncate" title={currentResponse.rewrittenQueries.join(' · ')}>
									searched: {currentResponse.rewrittenQueries.slice(0, 2).join(' · ')}
								</span>
							) : null}
						</div>
						<p className="text-xs leading-relaxed text-foreground/85 whitespace-pre-wrap">
							{answer.text}
						</p>
						{answer.citations.length > 0 && results.length > 0 ? (
							<div className="flex flex-wrap gap-1 pt-0.5">
								{answer.citations.map((c) => {
									const name = stripMdExt(basename(c.path));
									return (
										<button
											key={`${c.path}-${c.resultIndex}`}
											type="button"
											onClick={() => activate(c.resultIndex)}
											onMouseDown={(e) => e.preventDefault()}
											title={c.path}
											className="text-2xs px-1.5 py-0.5 rounded-sm bg-foreground/8 hover:bg-foreground/15 text-foreground/70 max-w-[200px] truncate"
										>
											[{c.resultIndex + 1}] {name}
										</button>
									);
								})}
							</div>
						) : null}
					</div>
				) : null}

				{results.length > 0 ? (
					<ul
						ref={listRef}
						id={`${idPrefix}-results`}
						role="listbox"
						aria-label="Search results"
						aria-busy={isLoading}
						className={cn(
							'py-1 transition-opacity duration-150',
							showStaleListLoading && 'opacity-50',
						)}
					>
						{results.map((r, i) => {
							const id = `${idPrefix}-result-${i}`;
							const isActive = i === activeIndex;
							const name = stripMdExt(basename(r.path));
							const parent = buildParentLabel(r.path, vaultRoot);
							return (
								<li
									key={`${r.path}#${r.chunkIndex ?? 0}-${i}`}
									id={id}
									role="option"
									aria-selected={isActive}
									data-selected={isActive}
									ref={(el) => {
										itemRefs.current[i] = el;
									}}
									onMouseDown={(e) => {
										e.preventDefault();
									}}
									onMouseMove={() => {
										if (i !== activeIndex) setActiveIndex(i);
									}}
									onClick={() => {
										activate(i);
									}}
									className={cn(
										'mx-1.5 my-0.5 px-2.5 py-1.5 rounded-md cursor-default',
										'flex flex-col gap-0.5',
										'data-[selected=true]:bg-foreground/8 hover:bg-foreground/4',
										'data-[selected=true]:hover:bg-foreground/8',
									)}
									style={{ minHeight: 48 }}
								>
									<div className="flex items-center gap-2 min-w-0">
										<span className="text-sm font-medium truncate text-foreground">{name}</span>
										{parent ? (
											<span className="text-2xs text-foreground/40 truncate">{parent}</span>
										) : null}
										<span className="flex-1" />
										{resultsSource ? (() => {
											const badge = sourceBadge(resultsSource);
											return (
												<span
													title={badge.title}
													className={cn(
														'text-2xs px-1.5 py-0.5 rounded-sm font-medium tracking-wide shrink-0',
														badge.className,
													)}
												>
													{badge.label}
												</span>
											);
										})() : null}
										{r.heading ? (
											<span className="text-2xs px-1.5 py-0.5 rounded-sm bg-foreground/10 text-foreground/60 max-w-[180px] truncate shrink-0">
												{r.heading}
											</span>
										) : null}
									</div>
									{r.snippet ? (
										<div className="text-xs text-foreground/55 truncate">{r.snippet}</div>
									) : null}
								</li>
							);
						})}
					</ul>
				) : null}
			</div>

			<div className="h-7 px-3 flex items-center justify-between text-2xs text-foreground/40 border-t border-foreground/10 shrink-0">
				<div className="truncate">{footerLeft}</div>
				<div className="flex items-center gap-3 shrink-0 ml-3">
					<span>
						<span className="text-foreground/60">↵</span> open
					</span>
					<span>
						<span className="text-foreground/60">↑↓</span> navigate
					</span>
					<span>
						<span className="text-foreground/60">⇥</span> ask
					</span>
					<span>
						<span className="text-foreground/60">esc</span> close
					</span>
				</div>
			</div>
		</div>
	);
}
