export type RagState = 'idle' | 'loading-model' | 'indexing' | 'ready' | 'error';

export type RagProgress = {
	state: RagState;
	total: number;
	indexed: number;
	currentFile?: string;
	errorMessage?: string;
	lastRunAt?: number;
};

export const RAG_PROGRESS_CHANNEL = 'rag:progress';
