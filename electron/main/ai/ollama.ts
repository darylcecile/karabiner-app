import { AIProvider, buildFileMetadataPrompt, FileMetadata } from "@/main/ai/index";
import { getPreferences } from "@/main/preferences";

type OllamaConfig = {
	baseUrl: string;
	model: string;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OllamaChatResponse = {
	message?: { role?: string; content?: string };
	done?: boolean;
};

const DEFAULT_TIMEOUT_MS = 120_000;

function readConfig(): OllamaConfig {
	const baseUrl =
		((getPreferences("ai.ollama.baseUrl") as string | undefined) ?? "http://localhost:11434").replace(/\/+$/, "");
	const model = (getPreferences("ai.ollama.model") as string | undefined) ?? "llama3.2";
	return { baseUrl, model };
}

async function chatCompletion(
	cfg: OllamaConfig,
	messages: ChatMessage[],
	opts: { timeoutMs?: number; temperature?: number } = {},
): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		const res = await fetch(`${cfg.baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: cfg.model,
				messages,
				stream: false,
				options: { temperature: opts.temperature ?? 0.2 },
			}),
			signal: controller.signal,
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
		}
		const data = (await res.json()) as OllamaChatResponse;
		return data.message?.content?.trim() ?? "";
	} finally {
		clearTimeout(timer);
	}
}

export class OllamaProvider extends AIProvider {
	private sessions = new Map<string, ChatMessage[]>();

	async ask(question: string): Promise<string> {
		const cfg = readConfig();
		return await chatCompletion(cfg, [{ role: "user", content: question }]);
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		const cfg = readConfig();
		const history = this.sessions.get(sessionId) ?? [];
		const messages: ChatMessage[] = [...history, { role: "user", content: question }];
		const reply = await chatCompletion(cfg, messages);
		messages.push({ role: "assistant", content: reply });
		this.sessions.set(sessionId, messages.slice(-20));
		return reply;
	}

	async generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null> {
		try {
			const cfg = readConfig();
			const prompt = buildFileMetadataPrompt(content, filename);
			const raw = await chatCompletion(cfg, [{ role: "user", content: prompt }], { temperature: 0 });
			return this.parseMetadataResponse(raw);
		} catch (err) {
			console.error("OllamaProvider.generateFileMetadata failed:", err);
			return null;
		}
	}

	resetSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	static async isAvailable(): Promise<boolean> {
		const cfg = readConfig();
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 1500);
			try {
				const res = await fetch(`${cfg.baseUrl}/api/tags`, { signal: controller.signal });
				return res.ok;
			} finally {
				clearTimeout(timer);
			}
		} catch {
			return false;
		}
	}
}
