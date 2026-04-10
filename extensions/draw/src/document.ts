export function createInitialTldrawDocument(): string {
  return JSON.stringify(
    {
      tldrawFileFormatVersion: 1,
      schema: {
        schemaVersion: 2,
        sequences: {
          "com.tldraw.store": 5,
          "com.tldraw.asset": 1,
          "com.tldraw.camera": 1,
          "com.tldraw.document": 2,
          "com.tldraw.instance": 26,
          "com.tldraw.instance_page_state": 5,
          "com.tldraw.page": 1,
          "com.tldraw.instance_presence": 6,
          "com.tldraw.pointer": 1,
          "com.tldraw.shape": 4,
          "com.tldraw.asset.bookmark": 2,
          "com.tldraw.asset.image": 6,
          "com.tldraw.asset.video": 5,
          "com.tldraw.shape.arrow": 8,
          "com.tldraw.shape.bookmark": 2,
          "com.tldraw.shape.draw": 4,
          "com.tldraw.shape.embed": 4,
          "com.tldraw.shape.frame": 1,
          "com.tldraw.shape.geo": 11,
          "com.tldraw.shape.group": 0,
          "com.tldraw.shape.highlight": 3,
          "com.tldraw.shape.image": 5,
          "com.tldraw.shape.line": 5,
          "com.tldraw.shape.note": 10,
          "com.tldraw.shape.text": 4,
          "com.tldraw.shape.video": 4,
          "com.tldraw.binding.arrow": 1,
        },
      },
      records: [],
    },
    null,
    2,
  );
}

function isLegacyInvalidEmptyDocument(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as {
      tldrawFileFormatVersion?: unknown;
      schema?: { schemaVersion?: unknown; sequences?: unknown };
      records?: unknown;
    };
    return (
      parsed.tldrawFileFormatVersion === 1 &&
      parsed.schema?.schemaVersion === 2 &&
      parsed.schema?.sequences &&
      typeof parsed.schema.sequences === "object" &&
      !Array.isArray(parsed.schema.sequences) &&
      Object.keys(parsed.schema.sequences).length === 0 &&
      Array.isArray(parsed.records) &&
      parsed.records.length === 0
    );
  } catch {
    return false;
  }
}

export function ensureNonEmptyTldrawDocument(content: string): {
  content: string;
  shouldWrite: boolean;
} {
  if (content.trim().length > 0 && !isLegacyInvalidEmptyDocument(content)) {
    return {
      content,
      shouldWrite: false,
    };
  }
  return {
    content: createInitialTldrawDocument(),
    shouldWrite: true,
  };
}
