# Karabiner

Karabiner is now a local-first desktop notes workspace built with Electrobun, React 19, and Tailwind CSS v4.

## What it currently does

- Open a folder as your workspace (with last-opened folder restore).
- Browse markdown and image files in a tree sidebar.
- Open files into tabs:
  - Markdown files open in a BlockNote editor.
  - Images open in a contained preview with click-to-zoom.
- Create and save notes directly to disk.
- Use a clean icon-first shell with sections for **Files**, **Extensions**, **Kai**, and **Settings**.

## Stack

- **Runtime**: Bun
- **Desktop framework**: Electrobun (not Electron)
- **UI**: React 19 + Tailwind CSS v4
- **Editor**: BlockNote
- **Data layer**: PGlite + pgvector extension
- **Build**: Vite + Electrobun build pipeline

## Development

```bash
# Install dependencies
bun install

# Build webview and run desktop app in dev mode
bun start

# Electrobun watch mode
bun run dev

# Vite HMR + desktop runtime
bun run dev:hmr

# Production build
bun run build

# Type-check
bun tsc --noEmit
```

## Project structure

```text
extensions/
└── draw/             # Official draw extension source (manifest + README + entrypoint)
packages/
└── sdk/              # @karabiner/sdk (TypeScript extension SDK scaffolding)
src/
├── bun/
│   ├── ai/           # Provider catalog + AI wiring entrypoints
│   ├── data/         # PGlite client + schema migrations
│   ├── extensions/   # Extension manifest/permissions/registry scaffolding
│   ├── notes/        # Workspace storage, file IO, note/image loading
│   └── index.ts      # App bootstrap + Bun-side RPC handlers
├── mainview/
│   ├── App.tsx       # Main UI shell, tabs, tree, editor/image views
│   ├── blocknote.css # Editor theming
│   ├── rpc.ts        # Webview-side RPC bridge
│   └── main.tsx      # React entrypoint
└── shared/
    ├── contracts/    # Shared domain contracts (notes, ai, app, permissions)
    └── rpc.ts        # Shared typed RPC schema
```

## Official extension registry

- `registry.karabiner.json` at repo root is the source of truth for official extension entries and is fetched at runtime via `gh api` (when available), then the GitHub API, with a local file fallback.
- `.github/workflows/release-extensions.yml` packages every `/extensions/*` folder as a `.tar.gz` artifact and attaches them to GitHub releases.

## Important implementation note

`electrobun.config.ts` explicitly copies required PGlite/pgvector runtime assets into the bundle (`vector.tar.gz`, `pglite.data`, `pglite.wasm`, `initdb.wasm`, `initdb.js`). If this mapping is removed or drifted, desktop runtime initialization will fail.

## Architecture docs

- [Extension system](docs/extension-system.md)
- [Extension runtime SDK](docs/extension-runtime-sdk.md)
