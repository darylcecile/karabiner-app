import { useState } from "react";
import type { Config } from '@/main/config';
import { main } from '@/renderer/relay';


export function useConfig() {
	const [config, setConfig] = useState<Config>(() => main.readConfig());

	function setConfigValue(key: string, value: any) {
		const newConfig = main.setConfig(key, value);
		setConfig(newConfig);
	}

	function getConfigValue(key: string) {
		return main.getConfig(key);
	}

	return {
		config,
		setConfigValue,
		getConfigValue,
	}
}