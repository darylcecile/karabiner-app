import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2CallWarning,
	LanguageModelV2Content,
	LanguageModelV2Message,
	LanguageModelV2Prompt,
	LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { AIProvider } from "@/main/ai/index";
import { AppleFoundationModelsProvider } from "@/main/ai/apple";
import { CopilotAIProvider } from "@/main/ai/copilot";

/**
 * Convert an AI SDK v2 prompt (system + user/assistant messages with parts)
 * into a single string suitable for our existing AIProvider.ask* methods.
 *
 * Our underlying providers (Claude CLI, Copilot, OpenAI completion, Ollama,
 * Apple FM) only accept a flat string prompt, so we serialize the conversation
 * with role tags. Tool-call / tool-result parts (if any) are summarized as
 * inline JSON so the model has context, even though it can't natively act on
 * them through this adapter.
 */
function flattenPrompt(prompt: LanguageModelV2Prompt): string {
	const parts: string[] = [];
	for (const message of prompt) {
		const text = renderMessage(message);
		if (text.length > 0) parts.push(text);
	}
	return parts.join("\n\n");
}

function renderMessage(message: LanguageModelV2Message): string {
	switch (message.role) {
		case "system":
			return `System: ${message.content}`;
		case "user": {
			const text = message.content
				.map((part): string => {
					if (part.type === "text") return part.text;
					if (part.type === "file") return `[file: ${part.filename ?? part.mediaType ?? "binary"}]`;
					return "";
				})
				.filter(Boolean)
				.join("\n");
			return `User: ${text}`;
		}
		case "assistant": {
			const text = message.content
				.map((part): string => {
					if (part.type === "text") return part.text;
					if (part.type === "reasoning") return `(reasoning) ${part.text}`;
					if (part.type === "tool-call") {
						const input = safeJsonStringify(part.input);
						return `[tool-call ${part.toolName}(${input})]`;
					}
					if (part.type === "tool-result") {
						return `[tool-result ${part.toolName}: ${safeJsonStringify(part.output)}]`;
					}
					return "";
				})
				.filter(Boolean)
				.join("\n");
			return `Assistant: ${text}`;
		}
		case "tool": {
			const text = message.content
				.map((part): string => `[tool-result ${part.toolName}: ${safeJsonStringify(part.output)}]`)
				.join("\n");
			return `Tool: ${text}`;
		}
		default:
			return "";
	}
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * LanguageModelV2 adapter that bridges the AI SDK to our existing AIProvider
 * abstraction. Tool calls are NOT emitted by this adapter — none of the
 * underlying providers expose a native tool-calling protocol we can map onto
 * v2 stream parts. Tool definitions passed to streamText() are surfaced as
 * `unsupported-tool` warnings on the stream-start chunk.
 *
 * For Apple Foundation Models we use `streamResponse()` for true incremental
 * streaming. All other providers are routed through `askWithSession()` and
 * the full response is delivered as a single text-delta chunk.
 */
export class BridgedLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2" as const;
	readonly provider: string;
	readonly modelId: string;
	readonly supportedUrls: Record<string, RegExp[]> = {};

	constructor(
		private readonly aiProvider: AIProvider,
		providerKind: string,
		private readonly chatId?: string,
	) {
		this.provider = `karabiner-bridge:${providerKind}`;
		this.modelId = providerKind || "unknown";
	}

	#sessionId(): string {
		// Prefer the chat id (stable across turns) so providers that support
		// resumable sessions (Copilot SDK) can carry conversation context.
		// Fall back to a random per-call id when no chat id is available.
		return this.chatId || crypto.randomUUID();
	}

	async doGenerate(
		options: LanguageModelV2CallOptions,
	): Promise<{
		content: Array<LanguageModelV2Content>;
		finishReason: "stop";
		usage: {
			inputTokens: number | undefined;
			outputTokens: number | undefined;
			totalTokens: number | undefined;
		};
		warnings: Array<LanguageModelV2CallWarning>;
	}> {
		const question = flattenPrompt(options.prompt);
		const sessionId = this.#sessionId();
		const text = await this.aiProvider.askWithSession(question, sessionId);
		return {
			content: [{ type: "text", text }],
			finishReason: "stop",
			usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
			warnings: buildWarnings(options),
		};
	}

	async doStream(
		options: LanguageModelV2CallOptions,
	): Promise<{ stream: ReadableStream<LanguageModelV2StreamPart> }> {
		const question = flattenPrompt(options.prompt);
		const isCopilot = this.aiProvider instanceof CopilotAIProvider;
		// Copilot natively executes the host's tools via its CLI (registered on
		// the Copilot session). Don't surface unsupported-tool warnings for it.
		const warnings = isCopilot ? [] : buildWarnings(options);
		const aiProvider = this.aiProvider;
		const abortSignal = options.abortSignal;
		const textId = crypto.randomUUID();
		const sessionId = this.#sessionId();

		const stream = new ReadableStream<LanguageModelV2StreamPart>({
			async start(controller) {
				let outputChars = 0;
				try {
					controller.enqueue({ type: "stream-start", warnings });
					controller.enqueue({ type: "text-start", id: textId });

					if (aiProvider instanceof AppleFoundationModelsProvider) {
						for await (const delta of aiProvider.streamAsk(question, abortSignal)) {
							if (abortSignal?.aborted) break;
							if (!delta) continue;
							outputChars += delta.length;
							controller.enqueue({ type: "text-delta", id: textId, delta });
						}
						controller.enqueue({ type: "text-end", id: textId });
					} else if (aiProvider instanceof CopilotAIProvider) {
						let currentTextId = textId;
						let textOpen = true;
						for await (const ev of aiProvider.streamAsk(question, sessionId, abortSignal)) {
							if (abortSignal?.aborted) break;
							if (ev.kind === "text") {
								if (!ev.delta) continue;
								if (!textOpen) {
									currentTextId = crypto.randomUUID();
									controller.enqueue({ type: "text-start", id: currentTextId });
									textOpen = true;
								}
								outputChars += ev.delta.length;
								controller.enqueue({ type: "text-delta", id: currentTextId, delta: ev.delta });
							} else if (ev.kind === "tool-call") {
								if (textOpen) {
									controller.enqueue({ type: "text-end", id: currentTextId });
									textOpen = false;
								}
								controller.enqueue({
									type: "tool-input-start",
									id: ev.id,
									toolName: ev.name,
									providerExecuted: true,
								});
								controller.enqueue({ type: "tool-input-end", id: ev.id });
								controller.enqueue({
									type: "tool-call",
									toolCallId: ev.id,
									toolName: ev.name,
									input: safeJsonStringify(ev.input),
									providerExecuted: true,
								});
							} else if (ev.kind === "tool-result") {
								controller.enqueue({
									type: "tool-result",
									toolCallId: ev.id,
									toolName: ev.name,
									result: ev.output,
									isError: ev.isError,
									providerExecuted: true,
								});
							}
						}
						if (textOpen) {
							controller.enqueue({ type: "text-end", id: currentTextId });
							textOpen = false;
						}
					} else {
						const text = await aiProvider.askWithSession(question, sessionId);
						if (text) {
							outputChars = text.length;
							controller.enqueue({ type: "text-delta", id: textId, delta: text });
						}
						controller.enqueue({ type: "text-end", id: textId });
					}

					controller.enqueue({
						type: "finish",
						finishReason: abortSignal?.aborted ? "other" : "stop",
						usage: {
							inputTokens: undefined,
							outputTokens: outputChars > 0 ? Math.ceil(outputChars / 4) : undefined,
							totalTokens: undefined,
						},
					});
					controller.close();
				} catch (err) {
					controller.enqueue({ type: "error", error: err });
					controller.enqueue({
						type: "finish",
						finishReason: "error",
						usage: {
							inputTokens: undefined,
							outputTokens: undefined,
							totalTokens: undefined,
						},
					});
					controller.close();
				}
			},
		});

		return { stream };
	}
}

function buildWarnings(options: LanguageModelV2CallOptions): Array<LanguageModelV2CallWarning> {
	const warnings: Array<LanguageModelV2CallWarning> = [];
	if (options.tools && options.tools.length > 0) {
		for (const tool of options.tools) {
			warnings.push({
				type: "unsupported-tool",
				tool,
				details:
					"Bridged provider does not natively emit tool calls; tools are exposed via slash-command interception in the protocol handler.",
			});
		}
	}
	return warnings;
}

export function createBridgedLanguageModel(
	provider: AIProvider,
	providerKind: string,
	chatId?: string,
): LanguageModelV2 {
	return new BridgedLanguageModel(provider, providerKind, chatId);
}
