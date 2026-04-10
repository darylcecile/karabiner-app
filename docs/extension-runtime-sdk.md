# Karabiner Extension Runtime SDK

This document describes the extension runtime SDK, what functionality it provides, and how extensions use it.

> This is the target SDK shape for extension authors. Minor signatures may evolve as the runtime is finalized.

---

## Goals

- Keep extension authoring simple (TypeScript-first).
- Make privileged access explicit and permission-checked.
- Provide stable registration APIs for app and editor contributions.
- Support high-performance modules (including WASM) without bypassing safety controls.

---

## Quick start

```ts
import { registerExtension } from "@karabiner/extensions-runtime";

export default registerExtension((runtime) => {
  runtime.onActivate(async (ctx) => {
    ctx.logger.info("Extension activated");
  });

  runtime.registerCommand({
    id: "acme.newNoteFromTemplate",
    title: "New note from template",
    run: async (ctx) => {
      await ctx.notes.create({
        title: "Project Note",
        markdown: "# Project Note\n\n## Goals\n",
      });
    },
  });

  runtime.onDeactivate(async (ctx) => {
    ctx.logger.info("Extension deactivated");
  });
});
```

---

## Lifecycle API

- `registerExtension(setup)` — entrypoint wrapper.
- `runtime.onActivate(handler)` — called after install approval and runtime boot.
- `runtime.onDeactivate(handler)` — called before unload/update/remove.

Use lifecycle hooks for lightweight initialization and cleanup only.

---

## Registration APIs

Extensions provide functionality by registering contributions through runtime methods.

| Method | Purpose |
| --- | --- |
| `registerCommand(...)` | Add user-invokable commands |
| `registerTool(...)` | Add callable tools for app/Kai workflows |
| `registerAIProvider(...)` | Contribute model/provider integrations |
| `registerBlockNotePlugin(...)` | Contribute editor capabilities |
| `registerEventHook(...)` | Subscribe to runtime/app events |

Example:

```ts
runtime.registerTool({
  id: "acme.summarizeSelection",
  description: "Summarize selected editor blocks",
  run: async (input, ctx) => {
    const markdown = await ctx.notes.getSelectionAsMarkdown();
    return ctx.ai.summarize(markdown, { style: input.style ?? "concise" });
  },
});
```

---

## Runtime context capabilities

Handler functions receive a `ctx` object with scoped APIs.

### Notes and workspace

- `ctx.notes.list()`
- `ctx.notes.read(noteId)`
- `ctx.notes.create(...)`
- `ctx.notes.update(...)`
- `ctx.workspace.root()`

### AI integration

- `ctx.ai.listProviders()`
- `ctx.ai.chat(...)`
- `ctx.ai.embed(...)`

### Extension-local storage

- `ctx.storage.get(key)`
- `ctx.storage.set(key, value)`
- `ctx.storage.delete(key)`

### Optional privileged APIs (permission-gated)

- `ctx.network.fetch(...)`
- `ctx.fs.readFile(...)`, `ctx.fs.writeFile(...)`
- `ctx.cli.exec(...)`

---

## Permission-aware behavior

Runtime methods are enforced by static manifest permissions. If an extension calls a gated API without permission, the host rejects the call with an explicit error.

| Capability | Manifest permission |
| --- | --- |
| Read notes | `notes.read` |
| Write notes | `notes.write` |
| Read filesystem | `filesystem.read` |
| Write filesystem | `filesystem.write` |
| Network calls | `network` |
| AI provider access | `ai.provider` |
| CLI execution | `cli.exec` |

Extensions should gracefully degrade when access is denied.

---

## BlockNote plugin API

Extensions can add editor behavior using `registerBlockNotePlugin(...)`, including:

- slash commands
- block transforms
- context actions
- format helpers

Example:

```ts
runtime.registerBlockNotePlugin({
  id: "acme.editor.quickActions",
  setup: (editor) => {
    editor.addSlashCommand({
      title: "Insert status checklist",
      onSelect: () =>
        editor.insertBlocks([
          { type: "paragraph", content: "- [ ] Todo" },
          { type: "paragraph", content: "- [ ] In progress" },
          { type: "paragraph", content: "- [ ] Done" },
        ]),
    });
  },
});
```

---

## WASM usage in extensions

Extensions can use WASM for performance-sensitive logic, while still using SDK registration and permission gates.

```ts
import { registerExtension } from "@karabiner/extensions-runtime";
import initParser, { parseMarkdown } from "./pkg/markdown_parser";

export default registerExtension((runtime) => {
  runtime.onActivate(async () => {
    await initParser();
  });

  runtime.registerTool({
    id: "acme.parseOutline",
    description: "Parse markdown headings with a WASM parser",
    run: async (_input, ctx) => {
      const markdown = await ctx.notes.getSelectionAsMarkdown();
      return parseMarkdown(markdown);
    },
  });
});
```

WASM improves throughput, but does not grant extra permissions.

---

## Reliability and limits

The runtime may enforce operational limits such as:

- timeouts for long-running handlers
- memory/CPU guardrails
- concurrency caps
- structured error boundaries per extension

Extensions should keep handlers fast and split heavy work into smaller operations.

---

## Versioning and compatibility

- Manifest `manifestVersion` defines compatibility with core schema.
- `engines.karabiner` and `engines.sdk` can constrain compatible app/SDK ranges.
- Breaking SDK changes should increment SDK major version and include migration notes.

