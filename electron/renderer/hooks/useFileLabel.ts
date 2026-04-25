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
	active: 'none' | 'claude' | 'copilot';
};

type AvailabilityState = {
	availability: AvailabilitySnapshot;
	provider: 'none' | 'auto' | 'claude' | 'copilot';
	enabled: boolean;
	fetchedAt: number;
};

const AVAILABILITY_TTL_MS = 10_000;

let availabilityCache: AvailabilityState | null = null;
let availabilityInflight: Promise<AvailabilityState> | null = null;

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
		let availability: AvailabilitySnapshot = { claude: false, copilot: false, active: 'none' };
		let provider: AvailabilityState['provider'] = 'auto';
		try {
			availability = await main.aiAvailability();
		} catch {
			availability = { claude: false, copilot: false, active: 'none' };
		}
		try {
			const raw = await main.preferences('ai.provider');
			if (raw === 'none' || raw === 'auto' || raw === 'claude' || raw === 'copilot') {
				provider = raw;
			}
		} catch {
			provider = 'auto';
		}
		const enabled = provider !== 'none' && availability.active !== 'none';
		const state: AvailabilityState = { availability, provider, enabled, fetchedAt: Date.now() };
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

const MAX_CONCURRENT_REGENERATE = 2;
let activeRegenerations = 0;
const regenerateQueue: Array<() => void> = [];

function scheduleRegenerate(absPath: string) {
	const run = () => {
		activeRegenerations += 1;
		main
			.regenerateFileLabel(absPath)
			.then((entry) => {
				cache.set(absPath, entry ?? null);
			})
			.catch(() => {
				cache.set(absPath, null);
			})
			.finally(() => {
				activeRegenerations -= 1;
				notifyPath(absPath);
				const next = regenerateQueue.shift();
				if (next) next();
			});
	};
	if (activeRegenerations < MAX_CONCURRENT_REGENERATE) {
		run();
	} else {
		regenerateQueue.push(run);
	}
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

export function requestLabel(absPath: string, isFolder = false): void {
	if (isFolder) return;
	if (cache.has(absPath)) return;

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
		} catch {
			// fall through; we'll decide below whether to regenerate
		}

		// Cache miss → only invoke AI if a provider is actually available.
		const state = await getAvailability().catch(() => null);
		if (!state || !state.enabled) {
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
