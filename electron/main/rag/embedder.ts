import path from "node:path";
import os from "node:os";

export type EmbedderState = "idle" | "loading" | "ready" | "error";

export type DownloadProgress = {
	name: string;
	loaded: number;
	total: number;
};

export type EmbedderStatus = {
	state: EmbedderState;
	errorMessage?: string;
	downloadProgress?: DownloadProgress;
};

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const PROGRESS_THROTTLE_MS = 200;

type Extractor = (
	text: string | string[],
	opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[]; dims?: number[] }>;

let status: EmbedderStatus = { state: "idle" };
let extractor: Extractor | null = null;
let loadPromise: Promise<void> | null = null;
let hasLoadedSuccessfully = false;

const subscribers = new Set<(s: EmbedderStatus) => void>();

let lastProgressEmit = 0;

function emitStatus(): void {
	for (const fn of subscribers) {
		try {
			fn(status);
		} catch {
			// ignore subscriber errors
		}
	}
}

function setStatus(next: EmbedderStatus, opts?: { throttle?: boolean }): void {
	if (opts?.throttle) {
		const now = Date.now();
		if (now - lastProgressEmit < PROGRESS_THROTTLE_MS) {
			status = next;
			return;
		}
		lastProgressEmit = now;
	}
	status = next;
	emitStatus();
}

function getCacheDir(): string {
	const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || "";
	return path.join(home, ".karabiner/cache/models");
}

export function isReady(): boolean {
	return hasLoadedSuccessfully;
}

export function getStatus(): EmbedderStatus {
	return status;
}

export function subscribeStatus(fn: (s: EmbedderStatus) => void): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}

export function ensureLoaded(): Promise<void> {
	if (extractor) return Promise.resolve();
	if (loadPromise) return loadPromise;

	loadPromise = (async () => {
		setStatus({ state: "loading" });
		try {
			const transformers = await import("@xenova/transformers");
			const { pipeline, env } = transformers;

			env.cacheDir = getCacheDir();
			env.allowLocalModels = true;
			env.allowRemoteModels = true;

			const pipe = await pipeline("feature-extraction", MODEL_ID, {
				progress_callback: (p: any) => {
					if (p && typeof p === "object" && p.status === "progress") {
						const name: string = p.file ?? p.name ?? MODEL_ID;
						const loaded: number = typeof p.loaded === "number" ? p.loaded : 0;
						const total: number = typeof p.total === "number" ? p.total : 0;
						setStatus(
							{
								state: "loading",
								downloadProgress: { name, loaded, total },
							},
							{ throttle: true },
						);
					}
				},
			});

			extractor = pipe as unknown as Extractor;
			hasLoadedSuccessfully = true;
			setStatus({ state: "ready" });
		} catch (err) {
			extractor = null;
			const offline =
				err instanceof Error &&
				/fetch|network|ENOTFOUND|ECONNREFUSED|getaddrinfo|offline/i.test(err.message);
			const message = offline
				? "Embedding model unavailable offline; will retry next launch"
				: err instanceof Error
					? err.message
					: String(err);
			setStatus({ state: "error", errorMessage: message });
			throw new Error(message);
		} finally {
			loadPromise = null;
		}
	})();

	// Swallow rejection here so callers that don't await don't trigger unhandled
	// rejections; callers awaiting `ensureLoaded` still receive the rejection
	// via the original promise reference returned above.
	const returned = loadPromise;
	returned.catch(() => {});
	return returned;
}

export async function embed(text: string): Promise<number[]> {
	await ensureLoaded();
	if (!extractor) throw new Error("Embedder not initialized");
	const out = await extractor(text, { pooling: "mean", normalize: true });
	return Array.from(out.data as ArrayLike<number>);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	await ensureLoaded();
	if (!extractor) throw new Error("Embedder not initialized");
	const out = await extractor(texts, { pooling: "mean", normalize: true });
	const data = out.data as Float32Array | number[];
	const flat = Array.from(data as ArrayLike<number>);
	const dim = flat.length / texts.length;
	const result: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		result.push(flat.slice(i * dim, (i + 1) * dim));
	}
	return result;
}
