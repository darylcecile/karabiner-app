import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import yaml from "yaml";
import { z } from "zod";
import { existsSync, writeFileSync, readFileSync } from "node:fs";

export const PreferencesPath = "~/.karabiner/config/preferences.yaml";

const PreferencesSchema = z.object({
	customizations: z.array(z.object({
		path: z.string(),
		icon: z.string().optional(),
		tint: z.string().optional(),
	})),
	ai: z.object({
		provider: z.enum(['none', 'auto', 'claude', 'copilot', 'openai', 'ollama', 'apple']).default('none'),
		labelGeneration: z.boolean().default(true),
		searchEnabled: z.boolean().default(true),
		askMode: z.object({
			enabled: z.boolean().default(true),
			autoDetect: z.boolean().default(true),
			showAnswer: z.boolean().default(true),
			showResults: z.boolean().default(true),
		}).default({ enabled: true, autoDetect: true, showAnswer: true, showResults: true }),
		openai: z.object({
			apiKey: z.string().default(''),
			model: z.string().default('gpt-4o-mini'),
			baseUrl: z.string().default('https://api.openai.com/v1'),
		}).default({ apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' }),
		ollama: z.object({
			baseUrl: z.string().default('http://localhost:11434'),
			model: z.string().default('llama3.2'),
		}).default({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
		copilot: z.object({
			cliPath: z.string().default(''),
		}).default({ cliPath: '' }),
	}).default({
		provider: 'none',
		labelGeneration: true,
		searchEnabled: true,
		askMode: { enabled: true, autoDetect: true, showAnswer: true, showResults: true },
		openai: { apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
		ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
		copilot: { cliPath: '' },
	}),
	rag: z.object({
		autoIndex: z.boolean().default(true),
	}).default({ autoIndex: true }),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

const defaultPreferences:Preferences = {
	customizations: [],
	ai: {
		provider: 'none',
		labelGeneration: true,
		searchEnabled: true,
		askMode: { enabled: true, autoDetect: true, showAnswer: true, showResults: true },
		openai: { apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
		ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
		copilot: { cliPath: '' },
	},
	rag: { autoIndex: true },
};

let preferencesCache: Preferences | null = null;

export function readPreferences(): Preferences {
	if (preferencesCache) return preferencesCache;
	const absPath = resolve(PreferencesPath.replace("~", process.env.HOME || ""));
	if (!existsSync(absPath)) {
		writeFileSync(absPath, yaml.stringify(defaultPreferences), "utf-8");
	}
	const preferences = yaml.parse(readFileSync(absPath, "utf-8"));
	preferencesCache = PreferencesSchema.parse(preferences)
	return preferencesCache;
}

export function setPreferences(key: string, value: any): Preferences {
	const absPath = resolve(PreferencesPath.replace("~", process.env.HOME || ""));
	const preferences = readPreferences();
	setProperty(preferences, key.split("."), value);
	const validation = PreferencesSchema.safeParse(preferences);
	if (!validation.success) {
		console.error("Invalid preferences:", validation.error);
		throw new Error("Invalid preferences: " + validation.error.message);
	}
	const newYaml = yaml.stringify(preferences);
	void writeFile(absPath, newYaml, "utf-8");
	preferencesCache = PreferencesSchema.parse(preferences);
	return preferencesCache;
}

export function getPreferences(key: string) {
	const preferences = readPreferences();
	return key.split(".").reduce((obj:any, part) => obj?.[part], preferences);
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
