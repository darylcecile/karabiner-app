import { AIProvider, buildFileMetadataPrompt, FileMetadata } from "@/main/ai/index";

type AppleModule = typeof import("@meridius-labs/apple-on-device-ai");

let cachedModule: AppleModule | null = null;
let moduleLoadPromise: Promise<AppleModule | null> | null = null;

async function loadAppleModule(): Promise<AppleModule | null> {
	if (process.platform !== "darwin") return null;
	if (cachedModule) return cachedModule;
	if (moduleLoadPromise) return moduleLoadPromise;
	moduleLoadPromise = (async () => {
		try {
			const mod = (await import("@meridius-labs/apple-on-device-ai")) as unknown as AppleModule;
			cachedModule = mod;
			return mod;
		} catch (err) {
			console.warn("[apple] failed to load @meridius-labs/apple-on-device-ai module:", err);
			return null;
		}
	})();
	return moduleLoadPromise;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class AppleFoundationModelsProvider extends AIProvider {
	private sessions = new Map<string, ChatMessage[]>();

	async ask(question: string): Promise<string> {
		const mod = await loadAppleModule();
		if (!mod) throw new Error("Apple Foundation Models are not available on this platform.");
		return await mod.appleAISDK.generateResponse(question);
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		const mod = await loadAppleModule();
		if (!mod) throw new Error("Apple Foundation Models are not available on this platform.");
		const history = this.sessions.get(sessionId) ?? [];
		const messages: ChatMessage[] = [...history, { role: "user", content: question }];
		const reply = await mod.appleAISDK.generateResponseWithHistory(messages);
		messages.push({ role: "assistant", content: reply });
		this.sessions.set(sessionId, messages.slice(-20));
		return reply;
	}

	async generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null> {
		try {
			const prompt = buildFileMetadataPrompt(content, filename);
			const raw = await this.ask(prompt);
			return this.parseMetadataResponse(raw);
		} catch (err) {
			console.error("AppleFoundationModelsProvider.generateFileMetadata failed:", err);
			return null;
		}
	}

	/**
	 * Stream a response token-by-token via the SDK's streaming chat completion.
	 * Yields text deltas from successive chunks.
	 */
	async *streamAsk(question: string, signal?: AbortSignal): AsyncGenerator<string, void, void> {
		const mod = await loadAppleModule();
		if (!mod) throw new Error("Apple Foundation Models are not available on this platform.");
		const messages: ChatMessage[] = [{ role: "user", content: question }];
		for await (const chunk of mod.appleAISDK.streamChatCompletion(messages)) {
			if (signal?.aborted) break;
			const delta = chunk?.choices?.[0]?.delta?.content;
			if (typeof delta === "string" && delta.length > 0) {
				yield delta;
			}
		}
	}

	resetSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	static async isAvailable(): Promise<boolean> {
		if (process.platform !== "darwin") return false;
		try {
			const mod = await loadAppleModule();
			if (!mod) return false;
			const status = await mod.appleAISDK.checkAvailability();
			return Boolean(status?.available);
		} catch (err) {
			console.warn("[apple] isAvailable check failed:", err);
			return false;
		}
	}
}
