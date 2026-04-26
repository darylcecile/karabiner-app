import { convertToModelMessages, stepCountIs, streamText, type LanguageModel, type UIMessage } from "ai";
import { getActiveProvider, getAIAvailability } from "@/main/ai/resolver";
import { createBridgedLanguageModel } from "./language-model";
import { providerSupportsNativeTools, tryCreateNativeModel } from "./native-models";
import { buildTools, tryInterceptSlashCommand, SLASH_COMMAND_HELP } from "./tools";

const SYSTEM_PROMPT_BASE = [
	"You are a helpful coding and notes assistant embedded in a desktop workspace app called Karabiner.",
	"The user's notes / code live in a vault directory which is referenced as the 'workspace'.",
	"Be concise. Prefer plain text. Use Markdown when it genuinely helps readability.",
	"",
	"PATH CONVENTIONS:",
	"- The vault is the root of the workspace. Refer to files by their workspace-relative path (e.g. 'Notes/welcome.md') or by basename if unique.",
	"- Do NOT prefix paths with '/workspace/' or any absolute path when calling readFile / writeFile / grep / searchFiles. The '/workspace' mountpoint only applies inside the runBash sandbox.",
	"- Before reading or editing a file, verify it exists with searchFiles or grep — do not assume filenames.",
	"",
	"SEARCHING:",
	"- For topic / idea / keyword lookups across the user's notes, use `searchWorkspace` first. It uses the same semantic + fuzzy engine as the app's search panel (vector embeddings with grep fallback), so it understands meaning, not just literal text.",
	"- Use `grep` only when you need a literal regex match (e.g. finding a specific code symbol or exact string).",
	"- Use `searchFiles` to look up files by name/path.",
	"- grep and searchFiles are case-insensitive by default. If a search returns no results, try a shorter or broader pattern before giving up.",
].join("\n");

const SYSTEM_PROMPT_NATIVE_TOOLS = [
	SYSTEM_PROMPT_BASE,
	"",
	"You have access to tools (readFile, writeFile, grep, searchFiles, runBash) that you can call directly to inspect and modify the workspace, or run sandboxed shell commands. Use them whenever it helps you answer the user's question accurately. Tools that mutate state (writeFile, runBash) require user approval before they execute.",
].join("\n");

const SYSTEM_PROMPT_BRIDGED = [
	SYSTEM_PROMPT_BASE,
	"",
	"Slash commands the user can run (executed locally before you see the result):",
	SLASH_COMMAND_HELP,
	"",
	"Note: tool definitions provided by the host are not callable directly by you with this provider. If the user wants tool output, instruct them to use the matching slash command.",
].join("\n");

type ChatRequestBody = { messages?: UIMessage[] };

function extractText(message: UIMessage): string {
	return message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

export async function handleChatRequest(request: Request): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204 });
	}
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return new Response("Invalid JSON body", { status: 400 });
	}
	const messages = Array.isArray(body.messages) ? body.messages : [];
	if (messages.length === 0) {
		return new Response("Missing messages", { status: 400 });
	}

	const availability = await getAIAvailability();
	const activeKind = availability.active;

	let model: LanguageModel;
	let useNativeTools = false;

	const nativeModel = await tryCreateNativeModel(activeKind);
	if (nativeModel && providerSupportsNativeTools(activeKind)) {
		model = nativeModel;
		useNativeTools = true;
	} else {
		const provider = await getActiveProvider();
		if (!provider) {
			return new Response("No AI provider configured. Please set one in Settings.", {
				status: 503,
			});
		}
		model = createBridgedLanguageModel(provider, activeKind);
	}

	const tools = buildTools();

	// For bridged providers (no native tool calling), intercept slash commands
	// on the latest user message and inline the result so the model has context.
	if (!useNativeTools) {
		const lastUser = [...messages].reverse().find((m) => m.role === "user");
		if (lastUser) {
			const text = extractText(lastUser);
			const slash = await tryInterceptSlashCommand(text);
			if (slash) {
				const annotated = `${text}\n\n[Local tool result for ${slash.command} ${slash.args}]\n${slash.output}`;
				lastUser.parts = [{ type: "text", text: annotated }];
			}
		}
	}

	const modelMessages = await convertToModelMessages(messages);

	const result = streamText({
		model,
		system: useNativeTools ? SYSTEM_PROMPT_NATIVE_TOOLS : SYSTEM_PROMPT_BRIDGED,
		messages: modelMessages,
		tools,
		stopWhen: stepCountIs(useNativeTools ? 8 : 1),
	});

	return result.toUIMessageStreamResponse();
}
