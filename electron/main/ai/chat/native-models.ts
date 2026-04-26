import { createOpenAI } from "@ai-sdk/openai";
import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2StreamPart,
	LanguageModelV3,
} from "@ai-sdk/provider";
import { getPreferences } from "@/main/preferences";

/**
 * Wrap a LanguageModelV2 whose stream emits text-delta parts without the
 * required text-start/text-end bookend (and possibly with churning ids).
 * The AI SDK UI message protocol rejects text-delta chunks for ids it has
 * not seen a text-start for, surfacing as "Received text-delta for missing
 * text part with ID ...". We normalise the stream so that a single textId
 * is used and the proper bookends are emitted.
 *
 * Apple's @meridius-labs/apple-on-device-ai is currently affected.
 */
function wrapStreamWithTextBookends(model: LanguageModelV2): LanguageModelV2 {
	return new Proxy(model, {
		get(target, prop, receiver) {
			if (prop === "doStream") {
				return async (options: LanguageModelV2CallOptions) => {
					const { stream } = await target.doStream(options);
					const textId = crypto.randomUUID();
					let textStarted = false;
					let textEnded = false;
					const fixed = new ReadableStream<LanguageModelV2StreamPart>({
						async start(controller) {
							const reader = stream.getReader();
							try {
								while (true) {
									const { value, done } = await reader.read();
									if (done) break;
									if (!value) continue;
									if (value.type === "text-start" || value.type === "text-end") {
										// drop incoming bookends; we manage our own.
										continue;
									}
									if (value.type === "text-delta") {
										if (!textStarted) {
											controller.enqueue({ type: "text-start", id: textId });
											textStarted = true;
										}
										controller.enqueue({ type: "text-delta", id: textId, delta: value.delta });
										continue;
									}
									if (value.type === "finish" && textStarted && !textEnded) {
										controller.enqueue({ type: "text-end", id: textId });
										textEnded = true;
									}
									controller.enqueue(value);
								}
								if (textStarted && !textEnded) {
									controller.enqueue({ type: "text-end", id: textId });
								}
							} catch (err) {
								controller.error(err);
								return;
							} finally {
								reader.releaseLock?.();
							}
							controller.close();
						},
					});
					return { stream: fixed };
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

/**
 * Build a native AI SDK LanguageModel for providers that have a first-class
 * Vercel AI SDK adapter. These models stream natively and support tool
 * calling.
 *
 * Returns null for providers without a native AI SDK adapter — the protocol
 * handler should fall back to the BridgedLanguageModel for those.
 */
export async function tryCreateNativeModel(
	providerKind: string,
): Promise<LanguageModelV2 | LanguageModelV3 | null> {
	if (providerKind === "openai") {
		const apiKey = (getPreferences("ai.openai.apiKey") as string | undefined) ?? "";
		if (!apiKey) return null;
		const baseURL = ((getPreferences("ai.openai.baseUrl") as string | undefined) ??
			"https://api.openai.com/v1").replace(/\/+$/, "");
		const model = (getPreferences("ai.openai.model") as string | undefined) ?? "gpt-4o-mini";
		const openai = createOpenAI({ apiKey, baseURL });
		return openai.chat(model);
	}
	if (providerKind === "ollama") {
		const baseURL = ((getPreferences("ai.ollama.baseUrl") as string | undefined) ??
			"http://localhost:11434").replace(/\/+$/, "");
		const model = (getPreferences("ai.ollama.model") as string | undefined) ?? "llama3.2";
		// Ollama exposes an OpenAI-compatible API at /v1.
		const openai = createOpenAI({
			apiKey: "ollama",
			baseURL: `${baseURL}/v1`,
		});
		return openai.chat(model);
	}
	if (providerKind === "apple") {
		try {
			const mod = await import("@meridius-labs/apple-on-device-ai");
			const raw = mod.appleAI("apple-on-device") as LanguageModelV2;
			return wrapStreamWithTextBookends(raw);
		} catch (err) {
			console.warn("[chat] failed to load Apple AI native model:", err);
			return null;
		}
	}
	return null;
}

export function providerSupportsNativeTools(providerKind: string): boolean {
	return providerKind === "openai" || providerKind === "ollama" || providerKind === "apple";
}

