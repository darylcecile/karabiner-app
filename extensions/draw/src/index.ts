import { registerExtension } from "@karabiner/sdk";

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
      return {
        title: fileName,
        contentType: "tldraw",
        content,
      };
    },
  });
});
