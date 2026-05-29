# Development setup

## Prerequisites

- Node.js 22+
- pnpm 10.33+
- Xcode with iOS simulators for mobile development
- Cloudflare account and Wrangler login for deployed backend work

## Install

```sh
pnpm install
```

The workspace enforces a seven-day npm package age gate. If a dependency install fails because a version is too new, do not bypass the gate casually; document the reason and either wait or choose an older compatible version.

## Backend

```sh
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
pnpm backend dev
```

Set `TOKEN_PEPPER` in `apps/backend/.dev.vars` before exercising auth/session routes. Local D1 migrations can be applied with:

```sh
pnpm --filter @karabiner/backend exec wrangler d1 migrations apply karabiner-dev --local
```

### Cloudflare resources

`apps/backend/wrangler.jsonc` already declares the binding names used by code: `DB`, `MEDIA_BUCKET`, `CHAT_ROOMS`, and `PLUGIN_DISPATCH`. For deployed work:

```sh
pnpm --filter @karabiner/backend exec wrangler login
pnpm --filter @karabiner/backend exec wrangler d1 create karabiner-dev
pnpm --filter @karabiner/backend exec wrangler r2 bucket create karabiner-media-dev
pnpm --filter @karabiner/backend exec wrangler queues create karabiner-plugin-dispatch-dev
pnpm --filter @karabiner/backend exec wrangler queues create karabiner-plugin-dispatch-dlq-dev
pnpm --filter @karabiner/backend exec wrangler secret put TOKEN_PEPPER
```

Copy the D1 `database_id` from Wrangler output into an environment-specific Wrangler config before deployment. Keep production origins narrow in `ALLOWED_ORIGINS`, and use Wrangler secrets for secrets rather than committed files.

## Mobile

```sh
pnpm mobile dev
```

The app is currently iOS-only in Expo config. Use `agent-device` for device/simulator inspection once a native build is installed:

```sh
pnpm mobile ios
pnpm device devices --platform ios
```

Current Expo dependencies are SDK 55-compatible because SDK 56 had not cleared the seven-day package-age gate during setup. When SDK 56 is old enough, upgrade in one reviewed dependency PR using Expo's SDK upgrade flow and re-run device inspection.

## Validation

```sh
pnpm check
pnpm --filter @karabiner/backend exec wrangler deploy --dry-run --outdir .wrangler-dry-run
pnpm --filter @karabiner/mobile exec expo config --type public
```

Remove `.wrangler-dry-run` after inspecting the artifact.
