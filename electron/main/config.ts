import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import yaml from "yaml";
import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const ConfigPath = "~/.karabiner/config/config.yaml";

const ConfigSchema = z.object({

});

export type Config = z.infer<typeof ConfigSchema>;

const defaultConfig:Config = {

};

let configCache: Config | null = null;

export function readConfig(): Config {
	if (configCache) return configCache;
	const absPath = resolve(ConfigPath.replace("~", process.env.HOME || ""));
	if (!existsSync(absPath)) {
		mkdirSync(resolve(absPath, ".."), { recursive: true });
		writeFileSync(absPath, yaml.stringify(defaultConfig), "utf-8");
	}
	const config = yaml.parse(readFileSync(absPath, "utf-8"));
	console.log("Loaded config:", config);
	configCache = ConfigSchema.parse(config)
	return configCache;
}

export function setConfig(key: string, value: any): Config {
	const absPath = resolve(ConfigPath.replace("~", process.env.HOME || ""));
	const config = readConfig();
	setProperty(config, key.split("."), value);
	const validation = ConfigSchema.safeParse(config);
	if (!validation.success) {
		console.error("Invalid config:", validation.error);
		throw new Error("Invalid config: " + validation.error.message);
	}
	const newYaml = yaml.stringify(validation.data);
	void writeFile(absPath, newYaml, "utf-8");
	configCache = validation.data;
	return configCache;
}

export function getConfig(key: string) {
	const config = readConfig();
	return key.split(".").reduce((obj, part) => obj?.[part], config);
}


// MARK utils

function setProperty(obj: any, path: string[], value: any) {
	if (path.length === 0) return;
	const [first, ...rest] = path;
	if (rest.length === 0) {
		obj[first] = value;
	} else {
		if (!obj[first]) obj[first] = {};
		setProperty(obj[first], rest, value);
	}
}
