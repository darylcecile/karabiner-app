import { useState } from "react";
import type { Config } from '@/main/config';


export function useConfig() {
	const [config, setConfig] = useState<Config>(() => window.electron.readConfig());

	function setConfigValue(key: string, value: any) {
		const newConfig = window.electron.setConfig(key, value);
		setConfig(newConfig);
	}

	function getConfigValue(key: string) {
		return window.electron.getConfig(key);
	}

	return {
		config,
		setConfigValue,
		getConfigValue,
	}
}