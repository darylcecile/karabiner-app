import type { RagProgress } from '@/shared/ragTypes';

export type { RagProgress, RagState } from '@/shared/ragTypes';

declare global {
	interface Window {
		karabinerEvents: {
			on: <T = unknown>(channel: string, listener: (payload: T) => void) => () => void;
		};
		karabinerFiles: {
			getPathForFile: (file: File) => string;
		};
	}
}

export function onRagProgress(listener: (p: RagProgress) => void): () => void {
	return window.karabinerEvents.on<RagProgress>('rag:progress', listener);
}

export type VaultFsChangeKind =
	| 'add'
	| 'change'
	| 'unlink'
	| 'addDir'
	| 'unlinkDir';

export interface VaultFsChangeEvent {
	path: string;
	kind: VaultFsChangeKind;
}

export function onVaultFsChange(listener: (event: VaultFsChangeEvent) => void): () => void {
	return window.karabinerEvents.on<VaultFsChangeEvent>('vault:fs-change', listener);
}

export {};
