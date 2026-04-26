import { main } from '@/renderer/relay';

/**
 * Whether the BlockNote AI features (slash command, formatting-toolbar AI
 * button, AI menu) should be active. Reads the `ai.provider` preference
 * synchronously: only `'none'` disables AI; everything else (including the
 * default `'auto'` / unset) enables it.
 *
 * If the user's selected provider doesn't actually support native tool calls
 * (Claude CLI, Copilot), the backend handler will return 503 — but we still
 * surface the UI so the user gets a clear error rather than a missing button.
 */
export function isEditorAIEnabled(): boolean {
	try {
		const provider = main.preferences('ai.provider') as string | undefined;
		return provider !== 'none';
	} catch {
		return false;
	}
}
