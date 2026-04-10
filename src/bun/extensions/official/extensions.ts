import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  EXTENSION_MANIFEST_VERSION,
  type ExtensionManifest,
} from "../../../shared/contracts/extensions";

type OfficialExtensionDefinition = {
  manifest: ExtensionManifest;
  readme: string;
  entrypointSource: string;
};

export type OfficialExtensionMetadata = {
  id: string;
  name: string;
  description?: string;
  version: string;
};

export type OfficialExtensionReadme = OfficialExtensionMetadata & {
  readme: string;
};

const DRAW_EXTENSION_README = `# Draw

Draw adds first-party tldraw support to Karabiner.

## What it adds

- **Inline editor block**: creates a new \`.tldraw\` file and inserts a link into the active note.
- **File preview handler**: opens \`.tldraw\` files in a dedicated preview tab.

## Permissions

- \`notes.write\`: insert links into the active editor.
- \`filesystem.read\` (\`$workspace\`): read \`.tldraw\` files from your current workspace.
- \`filesystem.write\` (\`$workspace\`): create new \`.tldraw\` files in your current workspace.
`;

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

const OFFICIAL_EXTENSIONS: OfficialExtensionDefinition[] = [
  {
    manifest: {
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
    },
    readme: DRAW_EXTENSION_README,
    entrypointSource: DRAW_EXTENSION_ENTRYPOINT,
  },
];

export function listOfficialExtensions(): OfficialExtensionMetadata[] {
  return OFFICIAL_EXTENSIONS.map((extension) => ({
    id: extension.manifest.id,
    name: extension.manifest.name,
    description: extension.manifest.description,
    version: extension.manifest.version,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export function readOfficialExtension(extensionId: string): OfficialExtensionReadme {
  const extension = OFFICIAL_EXTENSIONS.find(
    (candidate) => candidate.manifest.id === extensionId,
  );
  if (!extension) {
    throw new Error(`Unknown official extension "${extensionId}".`);
  }
  return {
    id: extension.manifest.id,
    name: extension.manifest.name,
    description: extension.manifest.description,
    version: extension.manifest.version,
    readme: extension.readme,
  };
}

export async function installOfficialExtension(
  extensionsDirectory: string,
  extensionId: string,
): Promise<string> {
  const extension = OFFICIAL_EXTENSIONS.find(
    (candidate) => candidate.manifest.id === extensionId,
  );
  if (!extension) {
    throw new Error(`Unknown official extension "${extensionId}".`);
  }

  const extensionDirectory = join(extensionsDirectory, extension.manifest.id);
  const files: Record<string, string> = {
    "extension.json": `${JSON.stringify(extension.manifest, null, 2)}\n`,
    "README.md": `${extension.readme.trim()}\n`,
    "src/index.ts": `${extension.entrypointSource.trim()}\n`,
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(extensionDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  return extensionDirectory;
}
