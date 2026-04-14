import { useEffect, useState } from "react";


export function usePlatform() {
	const [platform, setPlatform] = useState<"darwin" | "win32" | "linux" | "unknown">("unknown");

	useEffect(() => {
		const getPlatform = async () => {
			try {
				const platform = await window.electron.getPlatform();
				setPlatform(platform);
			} catch (error) {
				console.error('Failed to get platform:', error);
			}
		};

		void getPlatform();
	}, []);

	return platform;
}