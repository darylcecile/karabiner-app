import type { BlockNoteEditor } from "@blocknote/core";

type AnyBlock = any;
type AnyEditor = BlockNoteEditor<any, any, any>;

function isEmptyParagraph(block: AnyBlock): boolean {
	if (!block || block.type !== "paragraph") return false;
	const content = block.content;
	if (!content) return true;
	if (!Array.isArray(content)) return false;
	if (content.length === 0) return true;
	return content.every((node: any) => {
		if (!node) return true;
		if (node.type === "text") return !node.text;
		return false;
	});
}

function escapeAltText(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/[\r\n]+/g, " ");
}

function encodeUrlForMarkdown(url: string): string {
	if (/[\s()]/.test(url)) {
		return `<${url.replace(/>/g, "%3E")}>`;
	}
	return url;
}

function basenameFromUrl(url: string): string {
	try {
		const decoded = decodeURIComponent(url.split("?")[0].split("#")[0]);
		const segs = decoded.split("/").filter(Boolean);
		return segs[segs.length - 1] || "";
	} catch {
		return "";
	}
}

function blockToMarkdown(editor: AnyEditor, block: AnyBlock): string {
	if (isEmptyParagraph(block)) return "";
	if (block.type === "image") {
		const props = block.props ?? {};
		const url: string = props.url ?? "";
		if (!url) return "";
		const alt = (props.caption || props.name || "").toString();
		return `![${escapeAltText(alt)}](${encodeUrlForMarkdown(url)})`;
	}
	return editor.blocksToMarkdownLossy([block]).replace(/\n+$/, "");
}

/**
 * Serialize the editor to markdown, preserving blank-line spacing and using
 * `![caption](url)` for image blocks (preferring caption over name as alt).
 */
export function serializeEditorToMarkdown(editor: AnyEditor): string {
	return serializeBlocksToMarkdown(editor, editor.document as AnyBlock[]);
}

/**
 * Serialize a specific list of blocks (e.g. the current selection) using the
 * same rules as {@link serializeEditorToMarkdown}.
 */
export function serializeBlocksToMarkdown(
	editor: AnyEditor,
	blocks: AnyBlock[],
): string {
	if (blocks.length === 0) return "";

	let result = "";
	let pendingEmpties = 0;
	let firstContent = true;

	for (const block of blocks) {
		if (isEmptyParagraph(block)) {
			pendingEmpties++;
			continue;
		}
		const md = blockToMarkdown(editor, block);
		if (firstContent) {
			result += "\n".repeat(pendingEmpties);
			result += md;
			firstContent = false;
		} else {
			// Standard block separator is `\n\n`; each empty paragraph between
			// two content blocks contributes one extra `\n` (= one extra blank
			// line) on top of that.
			result += "\n\n" + "\n".repeat(pendingEmpties);
			result += md;
		}
		pendingEmpties = 0;
	}
	// Trailing empties become explicit blank lines at the end.
	if (pendingEmpties > 0) {
		result += "\n".repeat(pendingEmpties);
	}
	return result + "\n";
}

interface ContentSegment {
	kind: "content";
	text: string;
}
interface BlankSegment {
	kind: "blank";
	count: number;
}
type Segment = ContentSegment | BlankSegment;

/**
 * Split markdown into content chunks separated by runs of blank lines, while
 * respecting fenced code blocks (so blank lines inside ```fences``` are kept
 * as part of the surrounding code segment).
 */
function splitSegments(markdown: string): Segment[] {
	// Treat one final newline as the standard end-of-file marker, not a
	// blank-line run, so `a\n\nb\n` round-trips to `[a, b]` rather than
	// gaining a trailing empty paragraph.
	let normalized = markdown.replace(/\r\n/g, "\n");
	if (normalized.endsWith("\n")) normalized = normalized.slice(0, -1);
	const lines = normalized.split("\n");
	const segments: Segment[] = [];
	let buf: string[] = [];
	let blankCount = 0;
	let inFence = false;
	let fenceMarker = "";

	const flushBuf = () => {
		if (buf.length > 0) {
			segments.push({ kind: "content", text: buf.join("\n") });
			buf = [];
		}
	};
	const flushBlank = () => {
		if (blankCount > 0) {
			segments.push({ kind: "blank", count: blankCount });
			blankCount = 0;
		}
	};

	for (const line of lines) {
		if (inFence) {
			buf.push(line);
			if (line.trim() === fenceMarker) inFence = false;
			continue;
		}
		const fence = line.match(/^\s*(```+|~~~+)/);
		if (fence) {
			flushBlank();
			inFence = true;
			fenceMarker = fence[1];
			buf.push(line);
			continue;
		}
		if (line.trim() === "") {
			flushBuf();
			blankCount++;
		} else {
			flushBlank();
			buf.push(line);
		}
	}
	flushBuf();
	flushBlank();
	return segments;
}

function makeEmptyParagraph(): AnyBlock {
	return {
		type: "paragraph",
		props: {},
		content: [],
		children: [],
	};
}

function postProcessImageBlocks(blocks: AnyBlock[]): void {
	for (const block of blocks) {
		if (!block) continue;
		if (block.type === "image" && block.props) {
			const props = block.props;
			// Treat the markdown alt text (currently parsed into `name`) as the
			// caption — that's what users intend when they write `![text](url)`.
			if (!props.caption && props.name) {
				props.caption = props.name;
			}
			if (props.url) {
				const base = basenameFromUrl(props.url);
				if (base) props.name = base;
			}
		}
		if (Array.isArray(block.children) && block.children.length > 0) {
			postProcessImageBlocks(block.children);
		}
	}
}

/**
 * Parse markdown into BlockNote blocks, materializing extra blank lines as
 * empty paragraph blocks (so blank-line spacing round-trips).
 */
export function parseMarkdownToBlocks(
	editor: AnyEditor,
	markdown: string,
): AnyBlock[] {
	const segments = splitSegments(markdown);
	const blocks: AnyBlock[] = [];

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.kind === "content") {
			const parsed = editor.tryParseMarkdownToBlocks(seg.text) as AnyBlock[];
			if (parsed && parsed.length > 0) {
				blocks.push(...parsed);
			}
		} else {
			// One blank line is the standard block separator; any beyond that are
			// explicit empty paragraphs the user inserted for spacing.
			const leadingOrTrailing = i === 0 || i === segments.length - 1;
			const extras = leadingOrTrailing ? seg.count : seg.count - 1;
			for (let j = 0; j < extras; j++) {
				blocks.push(makeEmptyParagraph());
			}
		}
	}

	postProcessImageBlocks(blocks);
	return blocks;
}
