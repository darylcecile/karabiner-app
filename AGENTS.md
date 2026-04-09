# Karabiner App

A desktop application built with Electrobun, React 19, and Tailwind CSS v4.

## Critical Rules

- **NEVER use `npm` or `npx`.** This is a Bun project. Always use `bun` for all package management and script execution (e.g., `bun install`, `bun run build`, `bun tsc --noEmit`, `bun add <pkg>`).
- **NEVER use Electron APIs.** This app uses Electrobun, not Electron. They have completely different architectures and APIs.
- **Electrobun docs**: Full API at https://blackboard.sh/electrobun/llms.txt — fetch this when you need API details.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Desktop framework | Electrobun (NOT Electron) |
| Frontend | React 19 |
| Styling | Tailwind CSS v4 |
| Build tool | Vite |

## Project Structure

```
src/
├── bun/          # Main process — runs in Bun, has access to OS APIs via Electrobun
│   └── index.ts  # App entry point: creates window, sets up RPC handlers, app menu
├── mainview/     # Webview UI — React app built by Vite, loaded by Electrobun
│   ├── index.html
│   ├── main.tsx  # React root + RPC init
│   ├── App.tsx   # Root component
│   ├── rpc.ts    # Webview-side RPC (Electroview)
│   └── index.css # Tailwind entry
└── shared/       # Shared types between bun and webview
    └── rpc.ts    # RPC type definitions (AppRPC)
```

- `dist/` — Vite build output (gitignored)
- `build/` — Electrobun build output (gitignored)

## Key Patterns

### Electrobun RPC

Typed bidirectional communication between the Bun main process and the webview.

- **Bun side**: `BrowserView.defineRPC<AppRPC>()` — define handlers for requests the webview can call
- **Webview side**: `Electroview.defineRPC<AppRPC>()` — define handlers for requests Bun can call
- **Shared types**: `src/shared/rpc.ts` exports the `AppRPC` type used by both sides
- **RPC `maxRequestTime` defaults to 10 seconds.** Any handler taking longer silently drops the response.

### Views URL Scheme

Use `views://` URLs to reference bundled assets (e.g., `url: "views://mainview/index.html"`).
The `electrobun.config.ts` `build.copy` section maps Vite output to the views directory.

### Vite + Electrobun Integration

- Vite builds the React app from `src/mainview/` to `dist/`
- `electrobun.config.ts` copies `dist/` output into the Electrobun bundle's `views/` directory
- For HMR during development, run `bun run dev:hmr` which starts both Vite dev server and Electrobun

### Native File Dialogs

Native file dialogs block the Bun event loop. Use a fire-and-forget message pattern:
1. Webview sends an RPC message to Bun
2. Bun opens the dialog
3. Bun sends the result back via a separate RPC message

## Build & Run

```bash
bun install          # Install dependencies
bun start            # Build + run in dev mode
bun run dev          # Dev mode with file watching
bun run dev:hmr      # Dev mode with Vite HMR
bun run build        # Production build
bun run build:canary # Canary channel build
```

## Adding Dependencies

```bash
bun add <package>           # Runtime dependency
bun add -d <package>        # Dev dependency
```
