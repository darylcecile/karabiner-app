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
"- emoji: a single appropriate emoji character.",
'- category: short bucket like "Journal", "Project", "Research", "Notes".',
].join("\n");

export function buildFileMetadataPrompt(content: string, filename: string): string {
const truncated = content.length > 4000 ? content.slice(0, 4000) : content;
return [
FILE_METADATA_PROMPT_INSTRUCTIONS,
"",
`Filename: ${filename}`,
"Content:",
"---",
truncated,
"---",
'Respond with JSON only: {"label":"…","emoji":"…","category":"…"}',
].join("\n");
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
