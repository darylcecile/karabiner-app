export type Chunk = {
  chunkIndex: number;
  content: string;
  heading: string | null;
  startOffset: number;
  endOffset: number;
};

export type ChunkOptions = {
  targetChars?: number;
  maxChars?: number;
  overlapChars?: number;
};

type Section = {
  heading: string | null;
  headingLineLength: number;
  body: string;
  bodyStartOffset: number;
};

const DEFAULT_TARGET = 1800;
const DEFAULT_MAX = 2400;
const DEFAULT_OVERLAP = 200;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function stripFrontmatter(content: string): { body: string; offset: number } {
  if (!content.startsWith("---")) return { body: content, offset: 0 };
  const afterFirst = content.indexOf("\n");
  if (afterFirst === -1) return { body: content, offset: 0 };
  const firstLine = content.slice(0, afterFirst);
  if (firstLine.trim() !== "---") return { body: content, offset: 0 };
  const closeIdx = content.indexOf("\n---", afterFirst);
  if (closeIdx === -1) return { body: content, offset: 0 };
  const afterClose = content.indexOf("\n", closeIdx + 1);
  const end = afterClose === -1 ? content.length : afterClose + 1;
  return { body: content.slice(end), offset: end };
}

function splitSections(body: string, baseOffset: number): Section[] {
  const sections: Section[] = [];
  const lines = body.split("\n");
  let cursor = 0;
  let current: Section | null = null;

  const headingRe = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineLen = line.length + (i < lines.length - 1 ? 1 : 0);
    const match = headingRe.exec(line);
    if (match) {
      if (current) sections.push(current);
      const headingText = match[2]?.trim() ?? "";
      current = {
        heading: headingText,
        headingLineLength: lineLen,
        body: "",
        bodyStartOffset: baseOffset + cursor + lineLen,
      };
    } else {
      if (!current) {
        current = {
          heading: null,
          headingLineLength: 0,
          body: "",
          bodyStartOffset: baseOffset + cursor,
        };
      }
      current.body += line + (i < lines.length - 1 ? "\n" : "");
    }
    cursor += lineLen;
  }
  if (current) sections.push(current);

  return sections.filter((s) => s.heading !== null || s.body.trim().length > 0);
}

function buildContent(heading: string | null, body: string): string {
  const trimmed = body.trim();
  if (!heading) return trimmed;
  return `# ${heading}\n\n${trimmed}`;
}

function hardSplitParagraph(
  paragraph: string,
  paragraphOffset: number,
  maxChars: number,
  overlapChars: number,
): Array<{ text: string; start: number; end: number }> {
  const parts: Array<{ text: string; start: number; end: number }> = [];
  if (paragraph.length === 0) return parts;
  const step = Math.max(1, maxChars - overlapChars);
  let i = 0;
  while (i < paragraph.length) {
    const end = Math.min(paragraph.length, i + maxChars);
    parts.push({
      text: paragraph.slice(i, end),
      start: paragraphOffset + i,
      end: paragraphOffset + end,
    });
    if (end >= paragraph.length) break;
    i += step;
  }
  return parts;
}

export function chunkMarkdown(content: string, opts?: ChunkOptions): Chunk[] {
  if (!content || content.trim().length === 0) return [];

  const targetChars = opts?.targetChars ?? DEFAULT_TARGET;
  const maxChars = opts?.maxChars ?? DEFAULT_MAX;
  const overlapChars = opts?.overlapChars ?? DEFAULT_OVERLAP;

  const { body, offset: fmOffset } = stripFrontmatter(content);
  const sections = splitSections(body, fmOffset);

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionBody = section.body;
    const sectionStart = section.bodyStartOffset;
    const sectionEnd = sectionStart + sectionBody.length;

    if (sectionBody.trim().length === 0 && section.heading) {
      // Emit heading-only chunk so the heading is still indexed.
      const text = buildContent(section.heading, "");
      if (text.trim().length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: text,
          heading: section.heading,
          startOffset: sectionStart,
          endOffset: sectionStart,
        });
      }
      continue;
    }

    if (sectionBody.length <= maxChars) {
      const text = buildContent(section.heading, sectionBody);
      if (text.trim().length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: text,
          heading: section.heading,
          startOffset: sectionStart,
          endOffset: sectionEnd,
        });
      }
      continue;
    }

    // Sub-split by paragraph (split on \n\n+).
    const paragraphs: Array<{ text: string; start: number; end: number }> = [];
    const paraRe = /\n{2,}/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = paraRe.exec(sectionBody)) !== null) {
      const pText = sectionBody.slice(lastIdx, m.index);
      paragraphs.push({
        text: pText,
        start: sectionStart + lastIdx,
        end: sectionStart + m.index,
      });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx <= sectionBody.length) {
      paragraphs.push({
        text: sectionBody.slice(lastIdx),
        start: sectionStart + lastIdx,
        end: sectionStart + sectionBody.length,
      });
    }

    let bufText = "";
    let bufStart = -1;
    let bufEnd = -1;

    const flush = () => {
      if (bufStart < 0) return;
      const text = buildContent(section.heading, bufText);
      if (text.trim().length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: text,
          heading: section.heading,
          startOffset: bufStart,
          endOffset: bufEnd,
        });
      }
      bufText = "";
      bufStart = -1;
      bufEnd = -1;
    };

    for (const para of paragraphs) {
      if (para.text.trim().length === 0) continue;

      if (para.text.length > maxChars) {
        flush();
        const parts = hardSplitParagraph(
          para.text,
          para.start,
          maxChars,
          overlapChars,
        );
        for (const part of parts) {
          const text = buildContent(section.heading, part.text);
          if (text.trim().length > 0) {
            chunks.push({
              chunkIndex: chunkIndex++,
              content: text,
              heading: section.heading,
              startOffset: part.start,
              endOffset: part.end,
            });
          }
        }
        continue;
      }

      const sep = bufText.length > 0 ? "\n\n" : "";
      const projected = bufText.length + sep.length + para.text.length;

      if (bufText.length > 0 && projected > targetChars) {
        flush();
      }

      if (bufText.length === 0) {
        bufText = para.text;
        bufStart = para.start;
        bufEnd = para.end;
      } else {
        bufText = bufText + "\n\n" + para.text;
        bufEnd = para.end;
      }
    }
    flush();
  }

  // Touch estimateTokens so it stays a documented helper.
  void estimateTokens;

  return chunks;
}

if (process.env.RAG_CHUNKER_DEBUG) {
  const sample = `---
title: Demo
tags: [a, b]
---

intro paragraph before any heading.

# First Heading

Some body text under first heading. It is short.

## Sub Heading

${"lorem ipsum ".repeat(300)}

# Second Heading

para one.

para two.

para three.
`;
  const out = chunkMarkdown(sample);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}
