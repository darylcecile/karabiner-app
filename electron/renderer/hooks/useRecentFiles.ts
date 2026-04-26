import { useCallback, useEffect, useState } from 'react';
import { main } from '@/renderer/relay';

type RecentsChangedPayload = { recentFiles: string[] };

export function useRecentFiles() {
	const [recentFiles, setRecentFiles] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const initial = await main.getRecentFiles();
				if (!cancelled) setRecentFiles(initial);
			} catch {
				// no-op
			}
		})();
		const off = window.karabinerEvents.on<RecentsChangedPayload>('recents:changed', ({ recentFiles }) => {
			setRecentFiles(recentFiles ?? []);
		});
		return () => {
			cancelled = true;
			off();
		};
	}, []);

	const clearRecents = useCallback(async () => {
		await main.clearRecentFiles();
	}, []);

	return { recentFiles, clearRecents };
}
