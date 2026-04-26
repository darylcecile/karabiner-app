import { CopilotClient, approveAll, type Tool as CopilotTool } from "@github/copilot-sdk";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { AIProvider, buildFileMetadataPrompt, FileMetadata } from '@/main/ai/index';
import { buildTools } from "@/main/ai/chat/tools";

export type CopilotStreamEvent =
	| { kind: "text"; delta: string }
	| { kind: "tool-call"; id: string; name: string; input: unknown }
	| { kind: "tool-result"; id: string; name: string; output: unknown; isError?: boolean };

type ToolEmit = (ev: CopilotStreamEvent) => void;

/**
 * Definition for a tool whose execution happens elsewhere (e.g. the renderer
 * in the BlockNote AI flow). Copilot still needs to "call" it so the model's
 * decisions surface; we register a stub handler that captures the call and
 * returns synthetic success so Copilot keeps streaming.
 */
export type ExternalToolDef = {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
};

export class CopilotAIProvider extends AIProvider {
	#client: CopilotClient;

	constructor() {
		super();
		this.#client = this.#newClient();
	}

	#newClient(): CopilotClient {
		return new CopilotClient({ autoStart: true });
	}

	#buildCopilotTools(emit?: ToolEmit): CopilotTool[] {
		const aiTools = buildTools();
		const out: CopilotTool[] = [];
		for (const [name, t] of Object.entries(aiTools)) {
			const aiTool = t as {
				description?: string;
				inputSchema?: unknown;
				execute?: (args: unknown, opts?: unknown) => Promise<unknown> | unknown;
			};
			if (typeof aiTool.execute !== "function") continue;
			out.push({
				name,
				description: aiTool.description,
				parameters: aiTool.inputSchema as CopilotTool["parameters"],
				// Allow shadowing CLI built-ins (e.g. `grep`) — our handlers are
				// scoped to the user's vault and back the host UI.
				overridesBuiltInTool: true,
				skipPermission: true,
				handler: async (args: unknown) => {
					const id = crypto.randomUUID();
					emit?.({ kind: "tool-call", id, name, input: args });
					try {
						const result = await aiTool.execute!(args, undefined);
						emit?.({ kind: "tool-result", id, name, output: result ?? null });
						if (result == null) return "";
						if (typeof result === "string") return result;
						return JSON.stringify(result);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						emit?.({ kind: "tool-result", id, name, output: { error: message }, isError: true });
						return JSON.stringify({ error: message });
					}
				},
			});
		}
		return out;
	}

	#isClosedError(err: unknown): boolean {
		const msg = err instanceof Error ? err.message : String(err ?? "");
		return /Connection is closed|CLI server exited|EPIPE|connection closed/i.test(msg);
	}

	#isMissingSessionError(err: unknown): boolean {
		const msg = err instanceof Error ? err.message : String(err ?? "");
		return /Session not found/i.test(msg);
	}

	async #openSession(
		callerSessionId: string | undefined,
		tools: CopilotTool[] = this.#buildCopilotTools(),
		streaming = false,
		systemPromptOverride?: string,
	) {
		const systemMessage = systemPromptOverride
			? ({ mode: "replace" as const, content: systemPromptOverride })
			: undefined;
		// Try to resume an existing conversation first so context carries
		// across turns. Fall back to creating a fresh session (using the
		// caller id, when given, so subsequent turns can resume it again)
		// when no prior session exists.
		if (callerSessionId) {
			try {
				return await this.#client.resumeSession(callerSessionId, {
					onPermissionRequest: approveAll,
					model: "gpt-5.4",
					tools,
					streaming,
					...(systemMessage ? { systemMessage } : {}),
				});
			} catch (err) {
				if (!this.#isMissingSessionError(err)) throw err;
			}
		}
		return await this.#client.createSession({
			model: "gpt-5.4",
			onPermissionRequest: approveAll,
			tools,
			streaming,
			...(systemMessage ? { systemMessage } : {}),
			...(callerSessionId ? { sessionId: callerSessionId } : {}),
		});
	}

	private async internalAsk(question: string, sessionId?: string): Promise<string> {
		const tryOnce = async () => {
			// internalAsk is used by non-chat callers (RAG search, file
			// metadata, etc.) — they don't need tools or streaming.
			const session = await this.#openSession(sessionId, [], false);

			let response = "";
			const seenDeltaForMsg = new Set<string>();
			const done = new Promise<void>((resolve, reject) => {
				session.on("assistant.message_delta", (event) => {
					seenDeltaForMsg.add(event.data.messageId);
					response += event.data.deltaContent ?? "";
				});
				session.on("assistant.message", (event) => {
					if (!seenDeltaForMsg.has(event.data.messageId)) {
						response += event.data.content ?? "";
					}
				});
				session.on("session.idle", () => resolve());
				session.on("session.error", (event) => {
					reject(new Error(event.data?.message ?? "Copilot session error"));
				});
			});

			await session.send({ prompt: question });
			await done;
			await session.disconnect();
			return response;
		};

		try {
			return await tryOnce();
		} catch (err) {
			if (!this.#isClosedError(err)) throw err;
			// CLI subprocess crashed or connection torn down — replace the
			// client and try once more so we recover transparently.
			console.warn("[CopilotAIProvider] Connection lost, restarting CLI:", err);
			try { await this.#client.stop(); } catch {}
			this.#client = this.#newClient();
			return await tryOnce();
		}
	}

	async ask(question: string): Promise<string> {
		return this.internalAsk(question);
	}

	async askWithSession(question: string, sessionId: string): Promise<string> {
		return this.internalAsk(question, sessionId);
	}

	/**
	 * Stream a response delta-by-delta as the Copilot SDK emits
	 * `assistant.message_delta` events. Also surfaces tool execution
	 * activity inline so the user can see when Copilot is calling tools.
	 */
	async *streamAsk(
		question: string,
		sessionId?: string,
		signal?: AbortSignal,
	): AsyncGenerator<CopilotStreamEvent, void, void> {
		const queue: CopilotStreamEvent[] = [];
		let resolveNext: (() => void) | null = null;
		let done = false;
		let error: unknown = null;

		const emit = (ev: CopilotStreamEvent) => {
			if (ev.kind === "text" && !ev.delta) return;
			queue.push(ev);
			resolveNext?.();
			resolveNext = null;
		};
		const finish = (err?: unknown) => {
			if (err) error = err;
			done = true;
			resolveNext?.();
			resolveNext = null;
		};

		const tools = this.#buildCopilotTools(emit);

		const run = async () => {
			const tryOnce = async () => {
				const session = await this.#openSession(sessionId, tools, true);
				const seenDeltaForMsg = new Set<string>();

				session.on("assistant.message_delta", (event) => {
					seenDeltaForMsg.add(event.data.messageId);
					emit({ kind: "text", delta: event.data.deltaContent ?? "" });
				});
				session.on("assistant.message", (event) => {
					// If we never saw deltas for this message (e.g. CLI didn't
					// stream), emit the final content as a single chunk.
					if (!seenDeltaForMsg.has(event.data.messageId)) {
						emit({ kind: "text", delta: event.data.content ?? "" });
					}
				});
				session.on("session.idle", () => {
					finish();
					session.disconnect().catch(() => {});
				});
				session.on("session.error", (event) => {
					finish(new Error(event.data?.message ?? "Copilot session error"));
					session.disconnect().catch(() => {});
				});
				if (signal) {
					signal.addEventListener("abort", () => {
						finish();
						session.disconnect().catch(() => {});
					}, { once: true });
				}
				await session.send({ prompt: question });
			};
			try {
				await tryOnce();
			} catch (err) {
				if (!this.#isClosedError(err)) {
					finish(err);
					return;
				}
				console.warn("[CopilotAIProvider] Connection lost, restarting CLI:", err);
				try { await this.#client.stop(); } catch {}
				this.#client = this.#newClient();
				try { await tryOnce(); } catch (err2) { finish(err2); }
			}
		};
		run();

		while (!done || queue.length > 0) {
			if (queue.length === 0) {
				await new Promise<void>((resolve) => { resolveNext = resolve; });
				continue;
			}
			const next = queue.shift()!;
			yield next;
		}
		if (error) throw error;
	}

	/**
	 * Stream Copilot's response while exposing a caller-provided set of tools.
	 * Unlike #buildCopilotTools (which executes our own chat tools server-side),
	 * the tool handlers here are stubs: they capture the model's tool-call,
	 * surface it as a `kind: "tool-call"` event for the caller, and return
	 * synthetic success so Copilot keeps streaming. This is the bridge BlockNote
	 * AI relies on — the renderer applies the captured tool calls to the editor.
	 */
	async *streamWithExternalTools(
		question: string,
		options: {
			externalTools: ExternalToolDef[];
			systemPromptOverride?: string;
			sessionId?: string;
			signal?: AbortSignal;
		},
	): AsyncGenerator<CopilotStreamEvent, void, void> {
		const queue: CopilotStreamEvent[] = [];
		let resolveNext: (() => void) | null = null;
		let done = false;
		let error: unknown = null;

		const emit = (ev: CopilotStreamEvent) => {
			if (ev.kind === "text" && !ev.delta) return;
			queue.push(ev);
			resolveNext?.();
			resolveNext = null;
		};
		const finish = (err?: unknown) => {
			if (err) error = err;
			done = true;
			resolveNext?.();
			resolveNext = null;
		};

		const tools: CopilotTool[] = options.externalTools.map((def) => ({
			name: def.name,
			description: def.description,
			parameters: def.parameters as CopilotTool["parameters"],
			overridesBuiltInTool: true,
			skipPermission: true,
			handler: (args: unknown) => {
				const id = crypto.randomUUID();
				emit({ kind: "tool-call", id, name: def.name, input: args });
				// The tool will be executed by the renderer (BlockNote).
				// Return a sentinel to satisfy Copilot's expectation of a
				// result so it keeps streaming text after the call.
				return JSON.stringify({ ok: true, deferred: true });
			},
		}));

		const run = async () => {
			const tryOnce = async () => {
				const session = await this.#openSession(
					options.sessionId,
					tools,
					true,
					options.systemPromptOverride,
				);
				const seenDeltaForMsg = new Set<string>();

				session.on("assistant.message_delta", (event) => {
					seenDeltaForMsg.add(event.data.messageId);
					emit({ kind: "text", delta: event.data.deltaContent ?? "" });
				});
				session.on("assistant.message", (event) => {
					if (!seenDeltaForMsg.has(event.data.messageId)) {
						emit({ kind: "text", delta: event.data.content ?? "" });
					}
				});
				session.on("session.idle", () => {
					finish();
					session.disconnect().catch(() => {});
				});
				session.on("session.error", (event) => {
					finish(new Error(event.data?.message ?? "Copilot session error"));
					session.disconnect().catch(() => {});
				});
				if (options.signal) {
					options.signal.addEventListener("abort", () => {
						finish();
						session.disconnect().catch(() => {});
					}, { once: true });
				}
				await session.send({ prompt: question });
			};
			try {
				await tryOnce();
			} catch (err) {
				if (!this.#isClosedError(err)) {
					finish(err);
					return;
				}
				console.warn("[CopilotAIProvider] Connection lost, restarting CLI:", err);
				try { await this.#client.stop(); } catch {}
				this.#client = this.#newClient();
				try { await tryOnce(); } catch (err2) { finish(err2); }
			}
		};
		run();

		while (!done || queue.length > 0) {
			if (queue.length === 0) {
				await new Promise<void>((resolve) => { resolveNext = resolve; });
				continue;
			}
			const next = queue.shift()!;
			yield next;
		}
		if (error) throw error;
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
					const child = exec("gh auth status");
					child.unref();
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
