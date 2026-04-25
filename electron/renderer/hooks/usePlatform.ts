import { useEffect, useState } from "react";
import { main } from '@/renderer/relay';


export function usePlatform() {
	const [platform, setPlatform] = useState<"darwin" | "win32" | "linux" | "unknown">("unknown");

	useEffect(() => {
		const getPlatform = async () => {
			try {
				const platform = main.querySync("platform") as "darwin" | "win32" | "linux" | "unknown";
				setPlatform(platform);
			} catch (error) {
				console.error('Failed to get platform:', error);
			}
		};

		void getPlatform();
	}, []);

	return platform;
}