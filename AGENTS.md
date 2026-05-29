# Agent operating notes

This repo is intentionally documentation-heavy because future agents and maintainers need the context behind product and security decisions.

## Before changing code or docs

- Review `docs/internal/*.md` before starting meaningful work.
- Research current vendor docs when touching Expo, Apple platform APIs, Cloudflare, auth, security, or package management.
- Add important findings to `docs/internal/research.md`.
- Add durable architectural/product/security decisions to `docs/internal/decisions.md`.
- Add or update security rationale in `docs/internal/security.md` for auth, plugins, media, realtime, moderation, account deletion, and dependency changes.

## Dependency rules

- Use pnpm only.
- Keep `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`.
- Before installing or upgrading npm packages, inspect lifecycle scripts for the direct packages being added or changed.
- Do not allow dependency build/postinstall scripts unless the package is reviewed, necessary, and documented.
- Prefer exact versions for app/runtime dependencies during early development.

## Product rules

- Optimize the app for native-feeling iOS and iPadOS first.
- Use stable Expo APIs by default. When using alpha/unstable APIs, document the fallback and rationale.
- Sign in with Apple is the initial auth path. Do not add another auth provider without documenting App Store and security implications.
- User handles are product identifiers, not database identifiers. Use immutable IDs in storage and protocols.
- Keep plugin and agent integrations explicit, scoped, auditable, and revocable.

## Code rules

- Prefer shared protocol types from `packages/shared` over duplicating shapes.
- Keep comments focused on non-obvious rationale or constraints.
- Keep backend endpoints deny-by-default and validate input before state changes.
- Do not log tokens, Apple identity tokens, message bodies, media URLs, or plugin secrets.
