import { AIProvider, buildFileMetadataPrompt, FileMetadata } from "@/main/ai/index";

const SESSION_IDLE_MS = 5 * 60 * 1000;

type AppleModule = typeof import("apple-foundation-models");

type SessionEntry = {
	session: InstanceType<AppleModule["LanguageModelSession"]>;
	lastUsed: number;
};

let cachedModule: AppleModule | null = null;
let moduleLoadPromise: Promise<AppleModule | null> | null = null;

async function loadAppleModule(): Promise<AppleModule | null> {
	if (process.platform !== "darwin") return null;
	if (cachedModule) return cachedModule;
	if (moduleLoadPromise) return moduleLoadPromise;
	moduleLoadPromise = (async () => {
		try {
			const mod = (await import("apple-foundation-models")) as unknown as AppleModule;
			cachedModule = mod;
			return mod;
		} catch (err) {
			console.warn("[apple] failed to load apple-foundation-models module:", err);
			return null;
		}
	})();
	return moduleLoadPromise;
}

export class AppleFoundationModelsProvider extends AIProvider {
	private sessions = new Map<string, SessionEntry>();
	private cleanupTimer: NodeJS.Timeout | null = null;

	private scheduleCleanup() {
		if (this.cleanupTimer) return;
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			for (const [id, entry] of this.sessions) {
				if (now - entry.lastUsed > SESSION_IDLE_MS) {
					entry.session.close().catch(() => undefined);
					this.sessions.delete(id);
				}
			}
			if (this.sessions.size === 0 && this.cleanupTimer) {
				clearInterval(this.cleanupTimer);
				this.cleanupTimer = null;
			}
		}, 60_000);
		// Allow node to exit while idle.
		if (typeof this.cleanupTimer.unref === "function") this.cleanupTimer.unref();
	}

	async ask(question: string): Promise<string> {
		const mod = await loadAppleModule();
		if (!mod) throw new Error("Apple Foundation Models are not available on this platform.");
		const model = mod.SystemLanguageModel.default;
		if (!model.isAvailable) {
			throw new Error("Apple Foundation Models are unavailable on this device.");
		}
		const session = new mod.LanguageModelSession(model);
		try {
			const response = await session.respond(question);
			const content = (response as { content?: string })?.content;
			return typeof content === "string" ? content : String(content ?? "");
		} finally {
			await session.close().catch(() => undefined);
		}
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		const mod = await loadAppleModule();
		if (!mod) throw new Error("Apple Foundation Models are not available on this platform.");
		const existing = this.sessions.get(sessionId);
		let entry = existing;
		if (!entry) {
			const model = mod.SystemLanguageModel.default;
			if (!model.isAvailable) {
				throw new Error("Apple Foundation Models are unavailable on this device.");
			}
			entry = { session: new mod.LanguageModelSession(model), lastUsed: Date.now() };
			this.sessions.set(sessionId, entry);
			this.scheduleCleanup();
		}
		entry.lastUsed = Date.now();
		const response = await entry.session.respond(question);
		const content = (response as { content?: string })?.content;
		return typeof content === "string" ? content : String(content ?? "");
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

	async resetSession(sessionId: string): Promise<void> {
		const entry = this.sessions.get(sessionId);
		if (entry) {
			await entry.session.close().catch(() => undefined);
			this.sessions.delete(sessionId);
		}
	}

	static async isAvailable(): Promise<boolean> {
		if (process.platform !== "darwin") return false;
		try {
			const mod = await loadAppleModule();
			if (!mod) return false;
			const model = mod.SystemLanguageModel.default;
			return Boolean(model.isAvailable);
		} catch (err) {
			console.warn("[apple] isAvailable check failed:", err);
			return false;
		}
	}
}
