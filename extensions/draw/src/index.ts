import { registerExtension } from "@karabiner/sdk";
import {
  createInitialTldrawDocument,
  ensureNonEmptyTldrawDocument,
} from "./document";

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
        markdown: `> Drawing: [${fileName}](${fileName})\n`,
      };
    },
  });

  runtime.registerFilePreviewHandler({
    id: "karabiner.draw.preview",
    title: "tldraw preview",
    fileExtensions: [".tldraw"],
    render: async ({ path, fileName }, ctx) => {
      const content = await ctx.fs.readFile(path);
      const normalized = ensureNonEmptyTldrawDocument(content);
      if (normalized.shouldWrite) {
        await ctx.fs.writeFile(path, normalized.content);
      }
      return {
        title: fileName,
        contentType: "tldraw",
        content: normalized.content,
      };
    },
  });
});
