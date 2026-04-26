import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
	aiDocumentFormats,
	injectDocumentStateMessages,
	toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";
import { getAIAvailability } from "@/main/ai/resolver";
import { tryCreateNativeModel, providerSupportsNativeTools } from "../chat/native-models";

type EditorAIBody = {
	id?: string;
	messages?: UIMessage[];
	toolDefinitions?: Record<string, unknown>;
};

/**
 * Backend for the BlockNote AI extension. Mirrors the recipe from
 * https://www.blocknotejs.org/docs/features/ai/getting-started but using the
 * provider that the user has selected in Settings.
 *
 * Only providers that support native tool calls (OpenAI / Ollama / Apple) are
 * usable here — BlockNote AI relies on structured tool calls to mutate the
 * document. Bridged CLI providers (Claude, Copilot) get a 503 telling the user
 * to switch.
 */
export async function handleEditorAIRequest(request: Request): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204 });
	}
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	let body: EditorAIBody;
	try {
		body = (await request.json()) as EditorAIBody;
	} catch {
		return new Response("Invalid JSON body", { status: 400 });
	}

	const messages = Array.isArray(body.messages) ? body.messages : [];
	const toolDefinitions = (body.toolDefinitions ?? {}) as Parameters<typeof toolDefinitionsToToolSet>[0];

	const availability = await getAIAvailability();
	const activeKind = availability.active;
	if (!activeKind) {
		return new Response("No AI provider configured. Please set one in Settings.", { status: 503 });
	}

	const nativeModel = await tryCreateNativeModel(activeKind);
	if (!nativeModel || !providerSupportsNativeTools(activeKind)) {
		return new Response(
			"Editor AI requires a provider that supports native tool calls (OpenAI, Ollama, or Apple Intelligence).",
			{ status: 503 },
		);
	}

	const result = streamText({
		model: nativeModel,
		system: aiDocumentFormats.html.systemPrompt,
		messages: await convertToModelMessages(injectDocumentStateMessages(messages)),
		tools: toolDefinitionsToToolSet(toolDefinitions),
		toolChoice: "required",
	});

	return result.toUIMessageStreamResponse();
}
