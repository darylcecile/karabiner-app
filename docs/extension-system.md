# Karabiner Extension System

This document defines the extension model for Karabiner with two priorities:

1. **Simple to use** for extension authors.
2. **Safe and extendable** for long-term platform growth.

For SDK APIs and implementation examples, see [Extension Runtime SDK](./extension-runtime-sdk.md).

---

## Design goals

- **Local-first and explicit**: extensions must declare what they need.
- **Permission-gated**: no extension runs until permissions are approved.
- **Static permission vocabulary**: permission IDs are fixed by core, not extension-defined.
- **Composable contributions**: extensions can add providers, tools, commands, and editor capabilities.
- **Isolation by default**: extensions execute behind a controlled runtime boundary.

---

## Authoring model

Karabiner extensions are written primarily in **TypeScript** and **WASM**:

- **TypeScript-first** for most extension logic, APIs, and integration code.
- **WASM-friendly** for portable, performance-sensitive modules (parsing, transforms, indexing, etc.).

The manifest `entrypoint` points to the built JavaScript module loaded by the extension runtime.

---

## Installation flow

Extensions are installed through the app’s **Extension Installer**:

1. User selects an extension release from GitHub Releases.
2. App fetches the release tarball (`.tar.gz`).
3. App validates and unpacks the extension bundle.
4. App installs it under:
   - `~/.karabiner/user/extensions`
5. App reads `extension.json` and shows the permission prompt.
6. Extension is activated only after user approval.

---

## Manifest contract

Each extension ships an `extension.json` manifest.

Core fields:

- `manifestVersion`
- `id`, `name`, `version`
- `entrypoint`
- `permissions[]`
- `contributes` (optional)
- `engines` (optional compatibility constraints)

### Sample manifest (minimal)

```json
{
  "manifestVersion": 1,
  "id": "acme.quick-note",
  "name": "ACME Quick Note",
  "version": "1.0.0",
  "entrypoint": "dist/index.js",
  "permissions": [
    {
      "id": "notes.write",
      "reason": "Create quick notes from extension commands."
    }
  ]
}
```

### Sample manifest (full)

```json
{
  "manifestVersion": 1,
  "id": "acme.notes-tools",
  "name": "ACME Notes Tools",
  "version": "1.2.0",
  "entrypoint": "dist/index.js",
  "permissions": [
    {
      "id": "notes.read",
      "reason": "Read note content to power backlink suggestions."
    },
    {
      "id": "network",
      "allowlist": ["api.acme.dev"],
      "reason": "Call ACME cloud sync endpoint."
    }
  ],
  "contributes": {
    "commands": [
      {
        "id": "acme.insertTemplate",
        "title": "Insert ACME template",
        "description": "Insert a predefined project template."
      }
    ],
    "tools": [
      {
        "id": "acme.summarize",
        "description": "Summarize selected note blocks."
      }
    ]
  }
}
```

---

## Sample entrypoint (TypeScript)

```ts
import { registerExtension } from "@karabiner/extensions-runtime";

export default registerExtension((runtime) => {
  runtime.registerCommand({
    id: "acme.insertTemplate",
    title: "Insert ACME template",
    run: async (ctx) => {
      await ctx.notes.insertAtCursor("# Project template\n\n");
    },
  });

  runtime.registerTool({
    id: "acme.summarize",
    description: "Summarize selected note blocks",
    run: async (input, ctx) => ctx.ai.summarize(input.text),
  });

  runtime.registerBlockNotePlugin({
    id: "acme.blocknote.commands",
    setup: (editor) => {
      editor.addSlashCommand({
        title: "ACME checklist",
        onSelect: () => editor.insertBlocks([{ type: "paragraph", content: "- [ ] Task" }]),
      });
    },
  });
});
```

> Note: exact runtime SDK symbols may evolve; this example shows the intended registration pattern.

---

## Permission system

Permissions are **statically defined by core** and validated at install time.  
Every requested permission **must include a human-readable `reason`**.

Current static permission IDs:

| Permission ID | Purpose | Required scoped fields |
| --- | --- | --- |
| `notes.read` | Read notes in workspace scope | none |
| `notes.write` | Write notes in workspace scope | none |
| `filesystem.read` | Read filesystem paths | `roots[]` |
| `filesystem.write` | Write filesystem paths | `roots[]` |
| `network` | Outbound network access | `allowlist[]` |
| `ai.provider` | Access model/provider integrations | `providerIds[]` |
| `cli.exec` | Execute local CLI commands | `commands[]` |

### Approval model (required behavior)

Install flow must be:

1. Parse and validate manifest.
2. Show a **permission prompt UI** before first run.
3. Display each permission with:
   - permission ID
   - scope details (`roots`, `allowlist`, etc.)
   - extension-provided `reason`
4. User must approve (or reject) before extension activation.
5. Extension is not allowed to run unless approved.

### Runtime enforcement

At runtime, permissions are enforced by a gate that:

- checks permission presence (`require(...)`)
- restricts scoped resources (network domains, CLI command set, fs roots)
- denies undeclared access attempts with explicit errors

---

## Isolation and runtime model

Karabiner runs extensions in an isolated host/runtime boundary (not directly in core UI state).

### Runtime boundary

- Extension code communicates through a constrained API surface.
- Host owns privileged operations (filesystem, network, model access, CLI).
- Extension requests are checked against granted permissions before execution.

### Benefits of isolation

- **Safer installs by default**: a faulty or malicious extension cannot directly access core internals.
- **Clear trust boundaries**: every sensitive operation goes through host checks and audit-friendly APIs.
- **Reduced blast radius**: failures are constrained to extension scope rather than destabilizing the app.
- **Policy enforcement at one layer**: network, filesystem, AI provider, and CLI controls are centralized.
- **Future compatibility**: new extension capabilities can be added without weakening core security posture.

### WASM support

- WASM is optional for extension internals (e.g., parser/transforms/compute-heavy logic).
- If used, WASM executes under the same permission contract as the extension runtime.
- WASM does **not** bypass host permission checks.

### Limitations (by design)

- No implicit host/global access.
- No undeclared network access.
- No undeclared filesystem or CLI access.
- No direct mutation of app internals outside exposed extension APIs.
- Long-running or high-cost tasks may be throttled or rejected by host policy.

---

## Contribution model

Extensions can contribute capabilities to app surfaces.

### Current contribution types

- `contributes.aiProviders[]`
- `contributes.commands[]`
- `contributes.tools[]`

### Editor (BlockNote) contributions

Extensions are expected to support editor plugins/capabilities through explicit contribution points, for example:

- custom slash commands
- block transformers
- contextual tools/actions
- format helpers

All editor contributions must still execute under extension permission and runtime isolation rules.

---

## Simplicity for extension authors

Author workflow is intentionally small:

1. Create manifest.
2. Declare minimal permissions + clear reasons.
3. Implement entrypoint against extension SDK.
4. Install and review permission prompt.
5. Run after approval.

Best practices:

- request least privilege
- keep reasons specific and user-facing
- scope network/fs/CLI permissions narrowly
- degrade gracefully when a permission is denied

---

## Current implementation status (repo snapshot)

Implemented today:

- manifest schema and validation
- static permission ID model
- permission gate primitives
- extension registry skeleton
- contribution contract types

Planned / in-progress:

- installer UX wiring and release-ingestion hardening
- interactive permission prompt UI
- persistent permission grants + revocation UX
- finalized extension runtime process model
- full BlockNote plugin integration API
