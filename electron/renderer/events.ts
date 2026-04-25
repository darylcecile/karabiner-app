import type { RagProgress } from '@/shared/ragTypes';

export type { RagProgress, RagState } from '@/shared/ragTypes';

declare global {
	interface Window {
		karabinerEvents: {
			on: <T = unknown>(channel: string, listener: (payload: T) => void) => () => void;
		};
	}
}

export function onRagProgress(listener: (p: RagProgress) => void): () => void {
	return window.karabinerEvents.on<RagProgress>('rag:progress', listener);
}

export {};
