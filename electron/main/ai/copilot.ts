import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { AIProvider, buildFileMetadataPrompt, FileMetadata } from '@/main/ai/index';

export class CopilotAIProvider extends AIProvider {
	readonly #client: CopilotClient;

	constructor() {
		super();
		this.#client = new CopilotClient({ autoStart: true });
	}

	private async internalAsk(question: string, sessionId?: string): Promise<string> {
		const session = sessionId
			? await this.#client.resumeSession(sessionId, {
				onPermissionRequest: approveAll,
				model: "gpt-5.4",
			})
			: await this.#client.createSession({
				model: "gpt-5.4",
				onPermissionRequest: approveAll,
			});

		let response = "";

		const done = new Promise<void>((resolve) => {
			session.on("assistant.message", (event) => {
				response += event.data.content;
			});
			session.on("session.idle", () => {
				resolve();
			});
		});

		// Send a message and wait for completion
		await session.send({ prompt: question });
		await done;

		await session.disconnect();

		return response;
	}

	async ask(question: string): Promise<string> {
		return this.internalAsk(question);
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		return this.internalAsk(question, sessionId);
	}

	async generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null> {
		try {
			const prompt = buildFileMetadataPrompt(content, filename);
			const raw = await this.internalAsk(prompt);
			return this.parseMetadataResponse(raw);
		} catch (err) {
			console.error("CopilotAIProvider.generateFileMetadata failed:", err);
			return null;
		}
	}

	static async isAvailable(): Promise<boolean> {
		try {
			if (process.env.GH_COPILOT_TOKEN || process.env.GITHUB_TOKEN) return true;
			const home = process.env.HOME || process.env.USERPROFILE || "";
			if (home && existsSync(path.join(home, ".config", "github-copilot"))) return true;
			return await new Promise<boolean>((resolve) => {
				try {
					const child = spawn("gh", ["auth", "status"], { stdio: "ignore" });
					const timer = setTimeout(() => {
						try { child.kill(); } catch {}
						resolve(false);
					}, 1000);
					child.on("error", () => { clearTimeout(timer); resolve(false); });
					child.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
				} catch {
					resolve(false);
				}
			});
		} catch {
			return false;
		}
	}

	[Symbol.asyncDispose]() {
		return this.#client.stop();
	}
}
