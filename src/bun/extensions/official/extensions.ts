import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXTENSION_MANIFEST_VERSION } from "../../../shared/contracts/extensions";

type OfficialExtensionBundle = {
  id: string;
  files: Record<string, string>;
};

const DRAW_EXTENSION_MANIFEST = {
  manifestVersion: EXTENSION_MANIFEST_VERSION,
  id: "karabiner.draw",
  name: "Draw",
  version: "1.0.0",
  description: "Create drawing links and preview .tldraw files.",
  entrypoint: "src/index.ts",
  permissions: [
    {
      id: "notes.write",
      reason: "Insert draw links into the active note editor.",
    },
    {
      id: "filesystem.read",
      roots: ["$workspace"],
      reason: "Load .tldraw files from the current workspace for preview rendering.",
    },
    {
      id: "filesystem.write",
      roots: ["$workspace"],
      reason: "Create new .tldraw files in the current workspace.",
    },
  ],
  contributes: {
    inlineEditorBlocks: [
      {
        id: "karabiner.draw.inline",
        title: "Drawing canvas",
        description: "Create a .tldraw file and insert a note link to it.",
      },
    ],
    filePreviewHandlers: [
      {
        id: "karabiner.draw.preview",
        title: "tldraw preview",
        fileExtensions: [".tldraw"],
      },
    ],
  },
} as const;

const DRAW_EXTENSION_ENTRYPOINT = `import { registerExtension } from "@karabiner/sdk";

function createInitialTldrawDocument() {
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

function createFileName() {
  const now = new Date();
  const value = now.toISOString().replace(/[:.]/g, "-");
  return "drawing-" + value + ".tldraw";
}

export default registerExtension((runtime) => {
  runtime.registerInlineEditorBlock({
    id: "karabiner.draw.inline",
    title: "Drawing canvas",
    description: "Create a .tldraw file and insert a note link.",
    run: async (ctx) => {
      const fileName = createFileName();
      await ctx.fs.writeFile(fileName, createInitialTldrawDocument());
      return {
        markdown: "> Drawing: [" + fileName + "](" + fileName + ")\\n",
      };
    },
  });

  runtime.registerFilePreviewHandler({
    id: "karabiner.draw.preview",
    title: "tldraw preview",
    fileExtensions: [".tldraw"],
    render: async ({ path, fileName }, ctx) => {
      const content = await ctx.fs.readFile(path);
      return {
        title: fileName,
        contentType: "tldraw",
        content,
      };
    },
  });
});
`;

const OFFICIAL_EXTENSIONS: OfficialExtensionBundle[] = [
  {
    id: DRAW_EXTENSION_MANIFEST.id,
    files: {
      "extension.json": `${JSON.stringify(DRAW_EXTENSION_MANIFEST, null, 2)}\n`,
      "src/index.ts": `${DRAW_EXTENSION_ENTRYPOINT.trim()}\n`,
    },
  },
];

export async function installOfficialExtensions(
  extensionsDirectory: string,
): Promise<void> {
  for (const extension of OFFICIAL_EXTENSIONS) {
    const extensionDirectory = join(extensionsDirectory, extension.id);
    for (const [relativePath, content] of Object.entries(extension.files)) {
      const filePath = join(extensionDirectory, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }
  }
}
