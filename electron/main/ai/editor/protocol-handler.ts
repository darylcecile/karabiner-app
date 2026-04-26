import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getAIAvailability } from "@/main/ai/resolver";
import { tryCreateNativeModel, providerSupportsNativeTools } from "../chat/native-models";

type EditorAIBody = {
	id?: string;
	messages?: UIMessage[];
	toolDefinitions?: Record<string, unknown>;
};

// Lazily import @blocknote/xl-ai/server (ESM-only) so the CJS main bundle
// doesn't try to `require` it at startup. We also can't statically import it,
// since electron-vite externalizes it and Node CJS can't `require()` an ESM
// package whose transitive deps lack CJS exports.
type ServerModule = typeof import("@blocknote/xl-ai/server");
let serverModulePromise: Promise<ServerModule> | null = null;
function loadServerModule(): Promise<ServerModule> {
	if (!serverModulePromise) {
		serverModulePromise = import("@blocknote/xl-ai/server");
	}
	return serverModulePromise;
}

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

	const availability = await getAIAvailability();
	const activeKind = availability.active;
	if (!activeKind || activeKind === "none") {
		console.warn("[editor-ai] no active provider; availability=", availability);
		return new Response("No AI provider configured. Please set one in Settings.", { status: 503 });
	}

	if (!providerSupportsNativeTools(activeKind)) {
		console.warn(`[editor-ai] provider '${activeKind}' does not support native tools`);
		return new Response(
			`Editor AI requires a provider that supports native tool calls. The active provider '${activeKind}' does not — switch to OpenAI, Ollama, or Apple Intelligence in Settings.`,
			{ status: 503 },
		);
	}

	const nativeModel = await tryCreateNativeModel(activeKind);
	if (!nativeModel) {
		console.warn(`[editor-ai] tryCreateNativeModel returned null for '${activeKind}'`);
		return new Response(
			`Failed to initialise the '${activeKind}' provider. Check its configuration in Settings (e.g. API key).`,
			{ status: 503 },
		);
	}

	const { aiDocumentFormats, injectDocumentStateMessages, toolDefinitionsToToolSet } = await loadServerModule();
	const toolDefinitions = (body.toolDefinitions ?? {}) as Parameters<typeof toolDefinitionsToToolSet>[0];

	const result = streamText({
		model: nativeModel,
		system: aiDocumentFormats.html.systemPrompt,
		messages: await convertToModelMessages(injectDocumentStateMessages(messages)),
		tools: toolDefinitionsToToolSet(toolDefinitions),
		toolChoice: "required",
	});

	return result.toUIMessageStreamResponse();
}
