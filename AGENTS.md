# Karabiner App

A VS Code-like desktop IDE built with Electrobun, React 19, and Tailwind CSS v4.

## Critical Rules

- **NEVER use `npm` or `npx`.** This is a Bun project. Always use `bun` for all package management and script execution (e.g., `bun install`, `bun run build`, `bun tsc --noEmit`, `bun add <pkg>`).
- **NEVER use Electron APIs.** This app uses Electrobun, not Electron.
- **Native file dialogs block the bun event loop.** Use fire-and-forget message pattern (webview sends message, bun opens dialog, bun sends result back via separate message).
- **RPC `maxRequestTime` is 10 seconds.** Any handler taking longer silently drops the response.

## Stack

- **Runtime**: Bun
- **Desktop framework**: Electrobun (NOT Electron)
- **Frontend**: React 19, Tailwind CSS v4
- **Panel layout**: Dockview
- **File tree**: @headless-tree
- **Terminal**: xterm.js
- **Code editor**: @monaco-editor/react
- **Diff view**: @pierre/diffs
- **Command palette**: cmdk

## Project Structure

- `src/bun/` - Main process (Bun-side handlers, PTY, menu, file watcher)
- `src/mainview/` - Webview React app
- `src/mainview/components/` - React components (EditorPanel, DiffPanel, TerminalPanel, Sidebar, ContextSidebar, CommandPalette, StatusBar)
- `src/shared/` - Shared types and RPC definitions
- `dist/` - Build output (vite)

## Key Patterns

- **Electrobun RPC**: `BrowserView.defineRPC` for bun-side, `Electroview.defineRPC` for webview-side
- **Panel IDs**: Sidebars use `"sidebar"` and `"context-sidebar"`. File panels use `file:` prefix. Terminal panels use `terminal-` prefix.
- **Sidebar panels**: Use `SIDEBAR_PANEL_IDS` set to exclude sidebars from anchor searches
- **PTY output**: Base64-encoded on bun side, decoded on webview side. Batched at 8ms (~120fps).
- **File watcher**: `fs.watch` with `recursive: true` on macOS. Debounce 500ms before refreshing git status.
- **Monaco save**: Dispatch `CustomEvent("karabiner:save")` from Monaco action, listen in `useEffect` to avoid stale closures.
- **Vite build**: `build.minify: false` required (esbuild minifier corrupts xterm.js v6)
