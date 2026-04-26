import { useEffect, useReducer } from 'react';
import { main } from '@/renderer/relay';

export type FileLabelEntry = {
	label: string;
	emoji: string;
	category: string;
};

type CacheValue = FileLabelEntry | null | 'pending';

const cache = new Map<string, CacheValue>();
const pathSubscribers = new Map<string, Set<() => void>>();
const globalSubscribers = new Set<() => void>();

type AvailabilitySnapshot = {
	claude: boolean;
	copilot: boolean;
	openai: boolean;
	ollama: boolean;
	active: 'none' | 'claude' | 'copilot' | 'openai' | 'ollama';
};

type AvailabilityState = {
	availability: AvailabilitySnapshot;
	provider: 'none' | 'auto' | 'claude' | 'copilot' | 'openai' | 'ollama';
	enabled: boolean;
	labelGenerationEnabled: boolean;
	fetchedAt: number;
};

const AVAILABILITY_TTL_MS = 60_000;

let availabilityCache: AvailabilityState | null = null;
let availabilityInflight: Promise<AvailabilityState> | null = null;

const FAILURE_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function isBreakerOpen(): boolean {
	if (breakerOpenUntil === 0) return false;
	if (Date.now() < breakerOpenUntil) return true;
	// Breaker cooldown elapsed — close it.
	console.warn('[useFileLabel] AI label circuit breaker closed; resuming generation');
	breakerOpenUntil = 0;
	consecutiveFailures = 0;
	return false;
}

function recordSuccess() {
	consecutiveFailures = 0;
}

function recordFailure() {
	consecutiveFailures += 1;
	if (consecutiveFailures >= FAILURE_THRESHOLD) {
		breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
		consecutiveFailures = 0;
		console.warn(
			`[useFileLabel] AI label circuit breaker opened for ${BREAKER_COOLDOWN_MS}ms after ${FAILURE_THRESHOLD} consecutive failures`,
		);
	}
}

function drainQueueAsFailed() {
	if (regenerateQueue.length === 0) return;
	const drained = regenerateQueue.splice(0, regenerateQueue.length);
	for (const job of drained) job.skip();
}

function notifyPath(absPath: string) {
	const subs = pathSubscribers.get(absPath);
	if (subs) {
		for (const fn of subs) fn();
	}
	for (const fn of globalSubscribers) fn();
}

function isAvailabilityFresh(state: AvailabilityState | null): state is AvailabilityState {
	return state != null && Date.now() - state.fetchedAt < AVAILABILITY_TTL_MS;
}

async function fetchAvailability(): Promise<AvailabilityState> {
	if (availabilityInflight) return availabilityInflight;
	availabilityInflight = (async () => {
		let availability: AvailabilitySnapshot = { claude: false, copilot: false, openai: false, ollama: false, active: 'none' };
		let provider: AvailabilityState['provider'] = 'none';
		let labelGenerationEnabled = true;
		try {
			availability = await main.aiAvailability();
		} catch {
			availability = { claude: false, copilot: false, openai: false, ollama: false, active: 'none' };
		}
		try {
			const raw = await main.preferences('ai.provider');
			if (
				raw === 'none' || raw === 'auto' || raw === 'claude' ||
				raw === 'copilot' || raw === 'openai' || raw === 'ollama'
			) {
				provider = raw;
			}
		} catch {
			provider = 'none';
		}
		try {
			const raw = await main.preferences('ai.labelGeneration');
			if (raw === false) labelGenerationEnabled = false;
		} catch {
			// keep default true
		}
		const enabled = provider !== 'none' && availability.active !== 'none';
		const state: AvailabilityState = {
			availability,
			provider,
			enabled,
			labelGenerationEnabled,
			fetchedAt: Date.now(),
		};
		availabilityCache = state;
		return state;
	})();
	try {
		return await availabilityInflight;
	} finally {
		availabilityInflight = null;
	}
}

async function getAvailability(): Promise<AvailabilityState> {
	if (isAvailabilityFresh(availabilityCache)) return availabilityCache;
	return await fetchAvailability();
}

const MAX_CONCURRENT_REGENERATE = 1;
let activeRegenerations = 0;
type QueuedJob = { run: () => void; skip: () => void };
const regenerateQueue: QueuedJob[] = [];

function startNext() {
	if (activeRegenerations >= MAX_CONCURRENT_REGENERATE) return;
	if (isBreakerOpen()) {
		drainQueueAsFailed();
		return;
	}
	const next = regenerateQueue.shift();
	if (next) next.run();
}

function scheduleRegenerate(absPath: string) {
	const run = () => {
		if (isBreakerOpen()) {
			console.warn(`[useFileLabel] bail: circuit breaker opened mid-queue for ${absPath}`);
			cache.set(absPath, null);
			notifyPath(absPath);
			drainQueueAsFailed();
			return;
		}
		activeRegenerations += 1;
		main
			.regenerateFileLabel(absPath)
			.then((entry) => {
				cache.set(absPath, entry ?? null);
				if (entry) {
					recordSuccess();
				} else {
					console.warn(`[useFileLabel] regenerateFileLabel returned null for ${absPath}`);
					recordFailure();
				}
			})
			.catch((err) => {
				console.warn(`[useFileLabel] regenerateFileLabel threw for ${absPath}:`, err);
				cache.set(absPath, null);
				recordFailure();
			})
			.finally(() => {
				activeRegenerations -= 1;
				notifyPath(absPath);
				if (isBreakerOpen()) {
					drainQueueAsFailed();
					return;
				}
				startNext();
			});
	};
	const skip = () => {
		cache.set(absPath, null);
		notifyPath(absPath);
	};
	regenerateQueue.push({ run, skip });
	startNext();
}

export function getCachedLabel(absPath: string): CacheValue | undefined {
	return cache.get(absPath);
}

export function subscribeAllLabels(fn: () => void): () => void {
	globalSubscribers.add(fn);
	return () => {
		globalSubscribers.delete(fn);
	};
}

export function clearLabelCache() {
	cache.clear();
	availabilityCache = null;
	for (const fn of globalSubscribers) fn();
}

// Drop the cached label for a single path and immediately re-request it.
// Call this whenever the file's content (or filename heading) changes so the
// label re-derives from the new content.
export function invalidateFileLabel(absPath: string): void {
	if (!cache.has(absPath)) return;
	cache.delete(absPath);
	notifyPath(absPath);
	requestLabel(absPath, false);
}

// Debounced variant — coalesces rapid edits (e.g. typing in the editor) so
// we only re-derive the label after the user pauses.
const invalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const INVALIDATE_DEBOUNCE_MS = 1500;
export function invalidateFileLabelDebounced(absPath: string): void {
	const existing = invalidateTimers.get(absPath);
	if (existing) clearTimeout(existing);
	const t = setTimeout(() => {
		invalidateTimers.delete(absPath);
		invalidateFileLabel(absPath);
	}, INVALIDATE_DEBOUNCE_MS);
	invalidateTimers.set(absPath, t);
}

export function requestLabel(absPath: string, isFolder = false): void {
	if (isFolder) return;
	if (cache.has(absPath)) return;

	if (isBreakerOpen()) {
		console.warn(`[useFileLabel] bail: circuit breaker open for ${absPath}`);
		cache.set(absPath, null);
		return;
	}

	cache.set(absPath, 'pending');

	void (async () => {
		// Always try the persisted cache first — independent of AI availability —
		// so we never re-spend AI tokens for a file whose path & content (mtime)
		// haven't changed since we last labeled it.
		try {
			const existing = await main.getFileLabel(absPath);
			if (existing) {
				cache.set(absPath, existing);
				notifyPath(absPath);
				return;
			}
		} catch (err) {
			console.warn(`[useFileLabel] getFileLabel threw for ${absPath}:`, err);
			// fall through; we'll decide below whether to regenerate
		}

		// Cache miss → only invoke AI if a provider is actually available
		// AND label generation hasn't been explicitly disabled by the user.
		const state = await getAvailability().catch((err) => {
			console.warn(`[useFileLabel] availability check threw for ${absPath}:`, err);
			return null;
		});
		if (!state) {
			console.warn(`[useFileLabel] bail: no availability state for ${absPath}`);
			cache.set(absPath, null);
			notifyPath(absPath);
			return;
		}
		if (!state.enabled) {
			console.warn(
				`[useFileLabel] bail: AI not enabled (provider=${state.provider}, active=${state.availability.active}) for ${absPath}`,
			);
			cache.set(absPath, null);
			notifyPath(absPath);
			return;
		}
		if (!state.labelGenerationEnabled) {
			console.warn(`[useFileLabel] bail: label generation disabled in prefs for ${absPath}`);
			cache.set(absPath, null);
			notifyPath(absPath);
			return;
		}
		notifyPath(absPath);
		scheduleRegenerate(absPath);
	})();
}

export function useFileLabel(
	absPath: string,
	opts?: { isFolder?: boolean },
): { label: string | null; emoji: string | null; loading: boolean } {
	const isFolder = opts?.isFolder ?? false;
	const [, force] = useReducer((x: number) => x + 1, 0);

	useEffect(() => {
		if (isFolder || !absPath) return;
		let subs = pathSubscribers.get(absPath);
		if (!subs) {
			subs = new Set();
			pathSubscribers.set(absPath, subs);
		}
		subs.add(force);
		requestLabel(absPath, false);
		return () => {
			const s = pathSubscribers.get(absPath);
			if (!s) return;
			s.delete(force);
			if (s.size === 0) pathSubscribers.delete(absPath);
		};
	}, [absPath, isFolder]);

	if (isFolder || !absPath) {
		return { label: null, emoji: null, loading: false };
	}
	const entry = cache.get(absPath);
	if (entry === 'pending' || entry === undefined) {
		return { label: null, emoji: null, loading: true };
	}
	if (entry === null) {
		return { label: null, emoji: null, loading: false };
	}
	return { label: entry.label, emoji: entry.emoji, loading: false };
}
