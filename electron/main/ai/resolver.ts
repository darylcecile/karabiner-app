import { AIProvider } from "@/main/ai/index";
import { ClaudeCLIProvider } from "@/main/ai/claude";
import { CopilotAIProvider } from "@/main/ai/copilot";
import { getPreferences } from "@/main/preferences";

type ActiveKind = "none" | "claude" | "copilot";

let claudeInstance: ClaudeCLIProvider | null = null;
let copilotInstance: CopilotAIProvider | null = null;

let availabilityCache: { claude: boolean; copilot: boolean } | null = null;
let availabilityPromise: Promise<{ claude: boolean; copilot: boolean }> | null = null;

async function detectAvailability(): Promise<{ claude: boolean; copilot: boolean }> {
	if (availabilityCache) return availabilityCache;
	if (availabilityPromise) return availabilityPromise;
	availabilityPromise = (async () => {
		const [claude, copilot] = await Promise.all([
			ClaudeCLIProvider.isAvailable().catch(() => false),
			CopilotAIProvider.isAvailable().catch(() => false),
		]);
		availabilityCache = { claude, copilot };
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

function getProviderPreference(): "none" | "auto" | "claude" | "copilot" {
	try {
		const value = getPreferences("ai.provider");
		if (value === "none" || value === "auto" || value === "claude" || value === "copilot") {
			return value;
		}
	} catch {
		// ignore — fall back to auto
	}
	return "auto";
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
	// auto
	if (availability.claude) return { kind: "claude", provider: getClaude() };
	if (availability.copilot) return { kind: "copilot", provider: getCopilot() };
	return { kind: "none", provider: null };
}

export async function getAIAvailability(): Promise<{ claude: boolean; copilot: boolean; active: ActiveKind }> {
	const availability = await detectAvailability();
	const { kind } = await resolveActive();
	return { claude: availability.claude, copilot: availability.copilot, active: kind };
}

export async function getActiveProvider(): Promise<AIProvider | null> {
	const { provider } = await resolveActive();
	return provider;
}

export function clearAIAvailabilityCache(): void {
	availabilityCache = null;
	availabilityPromise = null;
}
