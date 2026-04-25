import { useCallback, useEffect, useState } from 'react';
import { main } from '@/renderer/relay';
import { onRagProgress, type RagProgress } from '@/renderer/events';

const INITIAL: RagProgress = { state: 'idle', total: 0, indexed: 0 };

export function useRagStatus() {
	const [status, setStatus] = useState<RagProgress>(INITIAL);

	const refresh = useCallback(() => {
		(main as any).ragGetStatus().then((s: RagProgress) => {
			if (s) setStatus(s);
		}).catch(() => {});
	}, []);

	useEffect(() => {
		let cancelled = false;
		(main as any).ragGetStatus().then((s: RagProgress) => {
			if (!cancelled && s) setStatus(s);
		}).catch(() => {});
		const unsub = onRagProgress((p) => {
			if (!cancelled) setStatus(p);
		});
		return () => {
			cancelled = true;
			unsub();
		};
	}, []);

	const start = useCallback(() => {
		(main as any).ragStartIndexing().catch(() => {});
	}, []);

	const stop = useCallback(() => {
		(main as any).ragStopIndexing().catch(() => {});
	}, []);

	return { status, refresh, start, stop };
}
