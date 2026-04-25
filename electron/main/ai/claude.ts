import { spawn } from "node:child_process";
import { AIProvider, buildFileMetadataPrompt, FileMetadata } from "@/main/ai/index";

const DEFAULT_TIMEOUT_MS = 30_000;

type SpawnResult = { stdout: string; stderr: string; code: number | null };

function runClaude(args: string[], opts: { timeoutMs?: number; input?: string } = {}): Promise<SpawnResult> {
	return new Promise((resolve) => {
		const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (result: SpawnResult) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};

		try {
			const child = spawn("claude", args, {
				stdio: ["pipe", "pipe", "pipe"],
				detached: true,
				windowsHide: true,
			});
			child.unref();
			const timer = setTimeout(() => {
				try { child.kill("SIGTERM"); } catch {}
				finish({ stdout, stderr, code: null });
			}, timeoutMs);

			child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
			child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
			child.on("error", () => {
				clearTimeout(timer);
				finish({ stdout, stderr, code: null });
			});
			child.on("exit", (code) => {
				clearTimeout(timer);
				finish({ stdout, stderr, code });
			});

			if (opts.input !== undefined && child.stdin) {
				child.stdin.end(opts.input);
			}
		} catch {
			finish({ stdout: "", stderr: "", code: null });
		}
	});
}

function extractFinalText(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";

	// Try parsing as a single JSON envelope first.
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed && typeof parsed === "object") {
			if (typeof parsed.result === "string") return parsed.result;
			if (typeof parsed.text === "string") return parsed.text;
			if (typeof parsed.content === "string") return parsed.content;
		}
	} catch {
		// not a single JSON object — try line-by-line
	}

	const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		try {
			const parsed = JSON.parse(line);
			if (parsed && typeof parsed === "object") {
				if (parsed.type === "result" && typeof parsed.result === "string") return parsed.result;
				if (typeof parsed.result === "string") return parsed.result;
				if (typeof parsed.text === "string") return parsed.text;
				if (parsed.message && typeof parsed.message.content === "string") return parsed.message.content;
			}
		} catch {
			// not JSON — fall through
		}
	}

	const lastLine = lines[lines.length - 1];
	if (lastLine) return lastLine;
	return trimmed;
}

export class ClaudeCLIProvider extends AIProvider {
	async ask(question: string): Promise<string> {
		const result = await runClaude(["-p", question, "--output-format", "json"]);
		if (result.code !== 0 && !result.stdout) {
			throw new Error(`claude CLI failed: ${result.stderr || "no output"}`);
		}
		return extractFinalText(result.stdout);
	}

	async askWithSession(question: string, _sessionId: string): Promise<string> {
		// Claude CLI in non-interactive mode doesn't expose a stable session API;
		// fall back to a one-shot ask.
		return this.ask(question);
	}

	async generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null> {
		try {
			const prompt = buildFileMetadataPrompt(content, filename);
			const raw = await this.ask(prompt);
			return this.parseMetadataResponse(raw);
		} catch (err) {
			console.error("ClaudeCLIProvider.generateFileMetadata failed:", err);
			return null;
		}
	}

	static async isAvailable(): Promise<boolean> {
		const result = await runClaude(["--version"], { timeoutMs: 1000 });
		return result.code === 0;
	}
}
