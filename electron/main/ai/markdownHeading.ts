// Extract or inject the H1/H2 title at the top of a markdown file so we can
// derive a label from user content (and let the user edit labels by editing
// their note's heading).

const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*\uFE0F?)\s*/u;

export type FrontmatterSplit = {
	frontmatter: string | null;
	body: string;
	bodyOffset: number;
};

// YAML frontmatter must start on the very first line as `---` and close with
// `---` on its own line. Anything else is treated as no frontmatter.
export function splitFrontmatter(content: string): FrontmatterSplit {
	if (!content.startsWith("---")) {
		return { frontmatter: null, body: content, bodyOffset: 0 };
	}
	const afterFirst = content.indexOf("\n");
	if (afterFirst === -1) return { frontmatter: null, body: content, bodyOffset: 0 };
	// First line must be exactly `---` (allow trailing CR).
	const firstLine = content.slice(0, afterFirst).trim();
	if (firstLine !== "---") return { frontmatter: null, body: content, bodyOffset: 0 };
	// Find a closing `---` line.
	const re = /\n---[ \t]*(?:\r?\n|$)/;
	const rest = content.slice(afterFirst + 1);
	const m = re.exec(rest);
	if (!m) return { frontmatter: null, body: content, bodyOffset: 0 };
	const closeEnd = afterFirst + 1 + m.index + m[0].length;
	return {
		frontmatter: content.slice(0, closeEnd),
		body: content.slice(closeEnd),
		bodyOffset: closeEnd,
	};
}

export type ExtractedHeading = {
	label: string;
	emoji: string;
};

// Return the first H1/H2 if it is the first non-empty line of the body
// (ignoring any leading frontmatter). Splits a leading emoji if present.
export function extractMarkdownHeading(content: string): ExtractedHeading | null {
	const { body } = splitFrontmatter(content);
	const lines = body.split(/\r?\n/);
	let firstNonEmpty: string | null = null;
	for (const line of lines) {
		if (line.trim().length > 0) {
			firstNonEmpty = line;
			break;
		}
	}
	if (firstNonEmpty === null) return null;
	const m = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(firstNonEmpty);
	if (!m) return null;
	let title = m[2].trim();
	if (!title) return null;
	let emoji = "";
	const em = LEADING_EMOJI_RE.exec(title);
	if (em) {
		emoji = em[1];
		title = title.slice(em[0].length).trim();
	}
	if (!title) return null;
	return { label: title, emoji };
}

// Insert `# {emoji} {label}` as the first heading of the body, preserving any
// leading YAML frontmatter. Ensures a blank line after the heading.
export function prependMarkdownHeading(
	content: string,
	label: string,
	emoji: string,
): string {
	const trimmedLabel = label.trim();
	if (!trimmedLabel) return content;
	const trimmedEmoji = emoji.trim();
	const heading = trimmedEmoji ? `## ${trimmedEmoji} ${trimmedLabel}` : `## ${trimmedLabel}`;
	const split = splitFrontmatter(content);
	const fm = split.frontmatter ?? "";
	let body = split.body;
	// Skip any leading blank lines in the body so the heading sits flush after
	// the frontmatter (or at the very top).
	body = body.replace(/^\s*\n+/, "");
	const fmSep = fm.length > 0 && !fm.endsWith("\n") ? "\n" : "";
	return `${fm}${fmSep}${heading}\n\n${body}`;
}

export function isMarkdownExtension(ext: string): boolean {
	const e = ext.toLowerCase();
	return e === ".md" || e === ".markdown" || e === ".mdx";
}
