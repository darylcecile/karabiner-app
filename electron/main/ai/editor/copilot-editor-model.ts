import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2Message,
	LanguageModelV2Prompt,
	LanguageModelV2StreamPart,
	LanguageModelV2FunctionTool,
} from "@ai-sdk/provider";
import { CopilotAIProvider, type ExternalToolDef } from "@/main/ai/copilot";

/**
 * Flatten an AI SDK v2 prompt to a single string, like the chat
 * BridgedLanguageModel does. We need this because Copilot's session-based API
 * accepts a free-form prompt string rather than a structured message list.
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
						return `[previous tool-call ${part.toolName}(${safeJsonStringify(part.input)})]`;
					}
					if (part.type === "tool-result") {
						return `[previous tool-result ${part.toolName}: ${safeJsonStringify(part.output)}]`;
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

function isFunctionTool(
	tool: LanguageModelV2FunctionTool | { type: string },
): tool is LanguageModelV2FunctionTool {
	return !!tool && (tool as { type?: string }).type === "function";
}

/**
 * LanguageModelV2 adapter for GitHub Copilot designed for the BlockNote AI
 * flow. Tool calls from the model are surfaced as proper AI SDK
 * `tool-input-start` / `tool-call` stream parts so BlockNote's client-side
 * extension can apply them to the editor.
 *
 * Copilot doesn't expose the raw chat-completions API; the SDK auto-executes
 * tool handlers. We work around this by registering each caller-provided tool
 * with a stub handler that captures the call (emitting it on our event queue)
 * and immediately returns a synthetic "ok" so Copilot keeps streaming.
 *
 * One consequence: the model thinks the tool ran, so it may emit follow-up
 * text or extra tool calls. That's acceptable for BlockNote AI — the
 * client-side extension only acts on tool-call parts.
 */
export class CopilotEditorLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2" as const;
	readonly provider = "karabiner-copilot-editor";
	readonly modelId = "copilot";
	readonly supportedUrls: Record<string, RegExp[]> = {};

	constructor(private readonly aiProvider: CopilotAIProvider) {}

	async doGenerate(): Promise<never> {
		// BlockNote AI uses streaming; non-streaming generate is not exercised.
		throw new Error("CopilotEditorLanguageModel only supports doStream().");
	}

	async doStream(
		options: LanguageModelV2CallOptions,
	): Promise<{ stream: ReadableStream<LanguageModelV2StreamPart> }> {
		const question = flattenPrompt(options.prompt);
		const systemPromptOverride = extractSystemPrompt(options.prompt);
		const externalTools: ExternalToolDef[] = (options.tools ?? [])
			.filter(isFunctionTool)
			.map((t) => ({
				name: t.name,
				description: t.description,
				parameters: t.inputSchema as Record<string, unknown> | undefined,
			}));
		const aiProvider = this.aiProvider;
		const abortSignal = options.abortSignal;
		const textId = crypto.randomUUID();

		const stream = new ReadableStream<LanguageModelV2StreamPart>({
			async start(controller) {
				let outputChars = 0;
				try {
					controller.enqueue({ type: "stream-start", warnings: [] });

					let currentTextId = textId;
					let textOpen = false;
					const startText = () => {
						if (!textOpen) {
							controller.enqueue({ type: "text-start", id: currentTextId });
							textOpen = true;
						}
					};
					const endText = () => {
						if (textOpen) {
							controller.enqueue({ type: "text-end", id: currentTextId });
							textOpen = false;
							currentTextId = crypto.randomUUID();
						}
					};

					for await (const ev of aiProvider.streamWithExternalTools(question, {
						externalTools,
						systemPromptOverride,
						signal: abortSignal,
					})) {
						if (abortSignal?.aborted) break;
						if (ev.kind === "text") {
							if (!ev.delta) continue;
							startText();
							outputChars += ev.delta.length;
							controller.enqueue({ type: "text-delta", id: currentTextId, delta: ev.delta });
						} else if (ev.kind === "tool-call") {
							endText();
							controller.enqueue({
								type: "tool-input-start",
								id: ev.id,
								toolName: ev.name,
							});
							controller.enqueue({
								type: "tool-input-delta",
								id: ev.id,
								delta: safeJsonStringify(ev.input),
							});
							controller.enqueue({ type: "tool-input-end", id: ev.id });
							controller.enqueue({
								type: "tool-call",
								toolCallId: ev.id,
								toolName: ev.name,
								input: safeJsonStringify(ev.input),
							});
						}
						// We deliberately skip ev.kind === "tool-result" here:
						// BlockNote (the client) executes the tool and emits the
						// result client-side. We surface only tool-call.
					}
					if (textOpen) {
						controller.enqueue({ type: "text-end", id: currentTextId });
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

function extractSystemPrompt(prompt: LanguageModelV2Prompt): string | undefined {
	const systems = prompt
		.filter((m): m is Extract<LanguageModelV2Message, { role: "system" }> => m.role === "system")
		.map((m) => m.content)
		.filter(Boolean);
	return systems.length > 0 ? systems.join("\n\n") : undefined;
}
