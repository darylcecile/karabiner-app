# Karabiner

A workbench app paired with Karabiner-Elements rulesets — a vault-backed editor,
a chat panel powered by your AI provider of choice (Copilot CLI, OpenAI,
Ollama, Apple Intelligence), and an inspector for Karabiner JSON configs.

## Installing the macOS build

Signed and notarized with Apple — drag Karabiner into `/Applications` and
double-click. No `xattr` workaround needed.

## Development

```sh
pnpm install
pnpm dev
```

### Building locally

```sh
pnpm run build:mac
```

The packaged DMGs land in `release/`.
