# Karabiner

Karabiner is an iOS/iPadOS-first, agent-native messaging app. It combines familiar chat primitives with structured message blocks, widgets/actions, slash commands, threads, group moderation, slug-mojis, media sharing, and explicit AI-agent channel integrations such as OpenClaw instances.

This repository is a pnpm monorepo:

| Path | Purpose |
| --- | --- |
| `apps/mobile` | Expo app optimized for iOS and iPadOS. |
| `apps/backend` | Cloudflare Workers backend with Durable Object WebSockets, D1, R2, and Queues. |
| `packages/shared` | Shared protocol and domain types used by app and backend. |
| `docs` | Architecture, user-facing integration docs, and internal engineering memory. |

See [`docs/development.md`](docs/development.md) for local setup.

## Current status

The repository contains the first Expo SDK 55-compatible iOS app shell, Cloudflare Worker backend foundation, Durable Object room stream, D1 schema, R2/Queue bindings, and shared protocol types. Some product flows are still prototype-backed while app-to-backend session, conversation, and plugin installation wiring is completed.

## Commands

| Command | Description |
| --- | --- |
| `pnpm install` | Install dependencies with the repo supply-chain policy. |
| `pnpm check` | Run all workspace checks. |
| `pnpm dev` | Start backend and mobile dev servers together. |
| `pnpm mobile dev` | Start the Expo app. |
| `pnpm mobile ios` | Build and launch the native iOS app for simulator/device testing. |
| `pnpm backend dev` | Start the Cloudflare Worker locally. |
| `pnpm typecheck` | Type-check all workspaces. |

## Supply-chain policy

Use pnpm only. The workspace sets `minimumReleaseAge: 10080`, which prevents installing package versions published in the last seven days. Dependency lifecycle scripts must be reviewed before installation; dependency postinstall/build scripts remain blocked unless a package is explicitly allowed and documented in `docs/internal/security.md`.

Expo packages are intentionally pinned to SDK 55-compatible versions until SDK 56 packages clear the seven-day gate. Upgrade to SDK 56 in one reviewed dependency PR: re-check package age, inspect lifecycle scripts, follow Expo's SDK upgrade flow, regenerate any native build, and validate with `pnpm check` plus `agent-device` simulator/device inspection.

## Architecture

- The mobile app uses Expo and TypeScript, with native iOS/iPadOS design conventions. SwiftUI-backed Expo UI remains an available escape hatch; native glass effects are gated for runtime availability.
- The backend uses Cloudflare Workers for HTTP APIs, Durable Objects for realtime room coordination, D1 for relational data, R2 for private media, and Queues for plugin dispatch and async jobs.
- Sign in with Apple is the first identity provider. User-facing identity is handle-based, while storage and protocols use immutable server-generated IDs.
- AI-agent integrations are explicit user-linked channel plugins with scoped tokens, signed webhooks, auditable actions, and revocation.

See `docs/architecture.md`, `docs/internal/security.md`, `docs/internal/decisions.md`, and `docs/internal/research.md` for the current rationale.
