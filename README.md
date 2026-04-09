# Karabiner

A desktop application built with [Electrobun](https://blackboard.sh/electrobun/), React 19, and Tailwind CSS v4.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- macOS, Linux, or Windows

## Getting Started

```bash
# Install dependencies
bun install

# Run in development (build + launch)
bun start

# Development with file watching
bun run dev

# Development with Vite HMR
bun run dev:hmr

# Production build
bun run build
```

## Project Structure

```
src/
├── bun/          # Main process (Bun runtime)
│   └── index.ts
├── mainview/     # Webview UI (React + Tailwind, built by Vite)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── rpc.ts
│   └── index.css
└── shared/       # Shared types (RPC schema)
    └── rpc.ts
```

## Stack

- **Runtime**: Bun
- **Desktop framework**: Electrobun (NOT Electron)
- **Frontend**: React 19, Tailwind CSS v4
- **Build tool**: Vite

## License

MIT
