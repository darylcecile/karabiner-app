import { AIProvider, buildFileMetadataPrompt, FileMetadata } from "@/main/ai/index";
import { getPreferences } from "@/main/preferences";

type OpenAIConfig = {
	apiKey: string;
	model: string;
	baseUrl: string;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionResponse = {
	choices?: Array<{
		message?: { role?: string; content?: string };
		finish_reason?: string;
	}>;
};

const DEFAULT_TIMEOUT_MS = 60_000;

function readConfig(): OpenAIConfig {
	const apiKey = (getPreferences("ai.openai.apiKey") as string | undefined) ?? "";
	const model = (getPreferences("ai.openai.model") as string | undefined) ?? "gpt-4o-mini";
	const baseUrl =
		((getPreferences("ai.openai.baseUrl") as string | undefined) ?? "https://api.openai.com/v1").replace(/\/+$/, "");
	return { apiKey, model, baseUrl };
}

async function chatCompletion(
	cfg: OpenAIConfig,
	messages: ChatMessage[],
	opts: { timeoutMs?: number; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${cfg.apiKey}`,
			},
			body: JSON.stringify({
				model: cfg.model,
				messages,
				temperature: opts.temperature ?? 0.2,
				max_tokens: opts.maxTokens ?? 1024,
			}),
			signal: controller.signal,
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
		}
		const data = (await res.json()) as ChatCompletionResponse;
		return data.choices?.[0]?.message?.content?.trim() ?? "";
	} finally {
		clearTimeout(timer);
	}
}

export class OpenAIProvider extends AIProvider {
	private sessions = new Map<string, ChatMessage[]>();

	async ask(question: string): Promise<string> {
		const cfg = readConfig();
		if (!cfg.apiKey) return "";
		return await chatCompletion(cfg, [{ role: "user", content: question }]);
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		const cfg = readConfig();
		if (!cfg.apiKey) return "";
		const history = this.sessions.get(sessionId) ?? [];
		const messages: ChatMessage[] = [...history, { role: "user", content: question }];
		const reply = await chatCompletion(cfg, messages);
		messages.push({ role: "assistant", content: reply });
		// Cap session length to prevent unbounded growth.
		this.sessions.set(sessionId, messages.slice(-20));
		return reply;
	}

	async generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null> {
		try {
			const cfg = readConfig();
			if (!cfg.apiKey) return null;
			const prompt = buildFileMetadataPrompt(content, filename);
			const raw = await chatCompletion(
				cfg,
				[{ role: "user", content: prompt }],
				{ maxTokens: 200, temperature: 0 },
			);
			return this.parseMetadataResponse(raw);
		} catch (err) {
			console.error("OpenAIProvider.generateFileMetadata failed:", err);
			return null;
		}
	}

	resetSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	static async isAvailable(): Promise<boolean> {
		const cfg = readConfig();
		if (!cfg.apiKey) return false;
		// We don't ping the API on every availability check (rate limits, latency).
		// Presence of an API key + a model is enough to be considered "configured".
		return Boolean(cfg.model && cfg.baseUrl);
	}
}
