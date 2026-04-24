import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { AIProvider } from '@/main/ai/index';

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
				model: "gpt-5",
			})
			: await this.#client.createSession({
				model: "gpt-5",
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

	[Symbol.asyncDispose]() {
		return this.#client.stop();
	}
}
