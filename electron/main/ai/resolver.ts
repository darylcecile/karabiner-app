import { AIProvider } from "@/main/ai/index";
import { ClaudeCLIProvider } from "@/main/ai/claude";
import { CopilotAIProvider } from "@/main/ai/copilot";
import { OpenAIProvider } from "@/main/ai/openai";
import { OllamaProvider } from "@/main/ai/ollama";
import { AppleFoundationModelsProvider } from "@/main/ai/apple";
import { getPreferences } from "@/main/preferences";

type ActiveKind = "none" | "claude" | "copilot" | "openai" | "ollama" | "apple";
type ProviderPref = "none" | "auto" | "claude" | "copilot" | "openai" | "ollama" | "apple";

export type AIAvailability = {
	claude: boolean;
	copilot: boolean;
	openai: boolean;
	ollama: boolean;
	apple: boolean;
	active: ActiveKind;
};

let claudeInstance: ClaudeCLIProvider | null = null;
let copilotInstance: CopilotAIProvider | null = null;
let openaiInstance: OpenAIProvider | null = null;
let ollamaInstance: OllamaProvider | null = null;
let appleInstance: AppleFoundationModelsProvider | null = null;

type AvailabilityShape = { claude: boolean; copilot: boolean; openai: boolean; ollama: boolean; apple: boolean };

let availabilityCache: AvailabilityShape | null = null;
let availabilityPromise: Promise<AvailabilityShape> | null = null;

async function detectAvailability(): Promise<AvailabilityShape> {
	if (availabilityCache) return availabilityCache;
	if (availabilityPromise) return availabilityPromise;
	availabilityPromise = (async () => {
		const [claude, copilot, openai, ollama, apple] = await Promise.all([
			ClaudeCLIProvider.isAvailable().catch(() => false),
			CopilotAIProvider.isAvailable().catch(() => false),
			OpenAIProvider.isAvailable().catch(() => false),
			OllamaProvider.isAvailable().catch(() => false),
			AppleFoundationModelsProvider.isAvailable().catch(() => false),
		]);
		availabilityCache = { claude, copilot, openai, ollama, apple };
		return availabilityCache;
	})();
	return availabilityPromise;
}

function getClaude(): ClaudeCLIProvider {
	if (!claudeInstance) claudeInstance = new ClaudeCLIProvider();
	return claudeInstance;
}

function getCopilot(): CopilotAIProvider {
	if (!copilotInstance) copilotInstance = new CopilotAIProvider();
	return copilotInstance;
}

function getOpenAI(): OpenAIProvider {
	if (!openaiInstance) openaiInstance = new OpenAIProvider();
	return openaiInstance;
}

function getOllama(): OllamaProvider {
	if (!ollamaInstance) ollamaInstance = new OllamaProvider();
	return ollamaInstance;
}

function getApple(): AppleFoundationModelsProvider {
	if (!appleInstance) appleInstance = new AppleFoundationModelsProvider();
	return appleInstance;
}

function getProviderPreference(): ProviderPref {
	try {
		const value = getPreferences("ai.provider");
		if (
			value === "none" ||
			value === "auto" ||
			value === "claude" ||
			value === "copilot" ||
			value === "openai" ||
			value === "ollama" ||
			value === "apple"
		) {
			return value;
		}
	} catch {
		// ignore — fall back to disabled
	}
	return "none";
}

async function resolveActive(): Promise<{ kind: ActiveKind; provider: AIProvider | null }> {
	const pref = getProviderPreference();
	if (pref === "none") return { kind: "none", provider: null };

	const availability = await detectAvailability();

	if (pref === "claude") {
		return availability.claude
			? { kind: "claude", provider: getClaude() }
			: { kind: "none", provider: null };
	}
	if (pref === "copilot") {
		return availability.copilot
			? { kind: "copilot", provider: getCopilot() }
			: { kind: "none", provider: null };
	}
	if (pref === "openai") {
		return availability.openai
			? { kind: "openai", provider: getOpenAI() }
			: { kind: "none", provider: null };
	}
	if (pref === "ollama") {
		return availability.ollama
			? { kind: "ollama", provider: getOllama() }
			: { kind: "none", provider: null };
	}
	if (pref === "apple") {
		return availability.apple
			? { kind: "apple", provider: getApple() }
			: { kind: "none", provider: null };
	}
	// auto — preference order: on-device first, then local CLIs, then hosted.
	if (availability.apple) return { kind: "apple", provider: getApple() };
	if (availability.claude) return { kind: "claude", provider: getClaude() };
	if (availability.copilot) return { kind: "copilot", provider: getCopilot() };
	if (availability.ollama) return { kind: "ollama", provider: getOllama() };
	if (availability.openai) return { kind: "openai", provider: getOpenAI() };
	return { kind: "none", provider: null };
}

export async function getAIAvailability(): Promise<AIAvailability> {
	const availability = await detectAvailability();
	const { kind } = await resolveActive();
	return { ...availability, active: kind };
}

export async function getActiveProvider(): Promise<AIProvider | null> {
	const { provider } = await resolveActive();
	return provider;
}

export function clearAIAvailabilityCache(): void {
	availabilityCache = null;
	availabilityPromise = null;
	// Drop hosted instances so config changes (api keys, urls, models) take effect.
	openaiInstance = null;
	ollamaInstance = null;
}
