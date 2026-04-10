export function createInitialTldrawDocument(): string {
  return JSON.stringify(
    {
      tldrawFileFormatVersion: 1,
      schema: {
        schemaVersion: 2,
        sequences: {},
      },
      records: [],
    },
    null,
    2,
  );
}

export function ensureNonEmptyTldrawDocument(content: string): {
  content: string;
  shouldWrite: boolean;
} {
  if (content.trim().length > 0) {
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
