import { z } from "zod";

export type FileMetadata = {
label: string;
emoji: string;
category: string;
};

const MetadataSchema = z.object({
label: z.string().min(1).max(80),
emoji: z.string().min(1).max(8),
category: z.string().min(1).max(40),
});

export const FILE_METADATA_PROMPT_INSTRUCTIONS = [
	"You are labeling a file for a notes application.",
	"Read the file content provided and respond with STRICT JSON only — no commentary, no markdown fences.",
	'Schema: {"label":"…","emoji":"…","category":"…"}',
	"- label: concise human-friendly title, ≤6 words, no surrounding quotes.",
	"  - DERIVE the label from the file CONTENT, not from the filename.",
	"  - DO NOT just rewrite, capitalise, or de-kebab the filename.",
	"  - The label MUST add information beyond the filename (e.g. the topic, the question being asked, the key entity).",
	"  - If the content is empty or too short to summarise, return an empty string for label.",
	"- emoji: a single appropriate emoji character that reflects the content's topic.",
	'- category: short bucket like "Journal", "Project", "Research", "Notes".',
].join("\n");

export function buildFileMetadataPrompt(content: string, filename: string): string {
	const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
	return [
		FILE_METADATA_PROMPT_INSTRUCTIONS,
		"",
		`Filename (for context only — DO NOT echo): ${filename}`,
		"Content:",
		"---",
		truncated,
		"---",
		'Respond with JSON only: {"label":"…","emoji":"…","category":"…"}',
	].join("\n");
}

function normalizeForCompare(value: string): string {
	return value
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[\s\-_./]+/g, " ")
		.trim();
}

export function isLabelEchoingFilename(label: string, filename: string): boolean {
	if (!label) return true;
	const a = normalizeForCompare(label);
	const b = normalizeForCompare(filename);
	if (!a || !b) return false;
	if (a === b) return true;
	// Reject when one is contained within the other and they're nearly identical length.
	if (a.length >= 3 && b.length >= 3) {
		if (b.includes(a) && a.length / b.length >= 0.8) return true;
		if (a.includes(b) && b.length / a.length >= 0.8) return true;
	}
	return false;
}

export abstract class AIProvider {

abstract ask(question: string): Promise<string>;
abstract askWithSession(question: string, sessionId: string): Promise<string>;
abstract generateFileMetadata(content: string, filename: string): Promise<FileMetadata | null>;

protected parseMetadataResponse(raw: string): FileMetadata | null {
if (!raw) return null;
const candidates: string[] = [];
const trimmed = raw.trim();
candidates.push(trimmed);

const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
if (fenceMatch && fenceMatch[1]) candidates.push(fenceMatch[1].trim());

const objMatch = trimmed.match(/\{[\s\S]*\}/);
if (objMatch) candidates.push(objMatch[0]);

for (const candidate of candidates) {
try {
const parsed = JSON.parse(candidate);
const result = MetadataSchema.safeParse(parsed);
if (result.success) return result.data;
} catch {
// keep trying
}
}
return null;
}
}
