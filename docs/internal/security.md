# Security notes

This document records security requirements and decisions for Karabiner. Update it whenever auth, media, realtime, plugins, moderation, account deletion, or dependencies change.

## Baseline posture

- Deny by default. Every backend route must authenticate before reading or mutating user data unless it is explicitly public, such as `/health`.
- Do not log Apple identity tokens, app session tokens, refresh tokens, plugin secrets, message bodies, or private media URLs.
- Use immutable server IDs in storage and protocol messages. User handles are mutable presentation identifiers and must not be used for authorization.
- Keep media private by default. Public R2 buckets are not part of the V1 model.
- AI-agent integrations are plugins, not privileged users. They require explicit scopes, audit trails, and revocation.

## Authentication and sessions

- V1 uses Sign in with Apple. The backend verifies Apple identity tokens against Apple's public JWKS, checks issuer, audience, expiry, and then mints app tokens.
- App sessions use opaque bearer tokens stored as hashes in D1, not raw tokens. This enables server-side revocation.
- Access tokens are short-lived. Refresh tokens are longer-lived and should be stored in iOS Keychain through `expo-secure-store`; use the strongest device-only accessibility level Expo supports on the target SDK.
- Logout revokes the presented token server-side and clears local secure storage.
- The mobile app must never embed Apple client secrets or backend secrets.

## Realtime and WebSockets

- WebSocket upgrades require an authenticated bearer token.
- Durable Objects coordinate room connections and use WebSocket hibernation-safe attachment state so connections can survive object eviction.
- The room Durable Object validates envelope shape and rejects sender spoofing by requiring `message.senderId` to match the authenticated socket user.
- Message bodies should not be logged by the Worker or Durable Object.
- Clients should reconnect with exponential backoff and refresh access tokens before reconnecting.

## Media and files

- R2 buckets remain private. Upload/download access is Worker-mediated with short-lived intents or signed URLs.
- Object keys include user ownership and content hash material to reduce enumeration risk.
- Upload intents cap file size. The first V1 cap is 10 MB until product and abuse requirements justify changing it.
- Future media hardening: async malware scanning, EXIF stripping, thumbnail generation, and explicit user consent before saving to Photos.

## Plugins, widgets, and slash commands

- Plugin scopes are explicit and deny-by-default:
  - `plugin:read` and `messages:read` for read access.
  - `plugin:write` and `messages:write` for sending messages, reactions, threads, and widget results.
  - `plugin:admin` only for administrative channel actions.
- Slash commands are resolved against installed plugin manifests. Unknown commands must fail closed.
- Widget actions are server-routed. The app displays actions but does not execute plugin code.
- Webhooks from or to plugins must use HMAC-SHA256 signatures with timestamp and nonce replay protection before production use.
- Users and group owners can revoke plugin installations. Revocation should invalidate tokens and disconnect webhooks immediately.

## Group moderation and account deletion

- Group roles are owner, moderator, member, and guest.
- Moderation actions such as delete, mute, ban, invite, and role change are written to append-only audit records.
- Account deletion is user-initiated in-app. V1 should support a grace period, session revocation, media deletion, and message redaction/anonymization boundaries.
- Data export and deletion workflows must be implemented before production launch.

## Dependency and build security

- Use pnpm only.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` so new npm package versions must cool down for seven days before installation.
- `blockExoticSubdeps: true` prevents transitive dependencies from resolving through git/tarball URLs.
- Direct dependency lifecycle scripts are reviewed before installing or upgrading. Dependency postinstall/build scripts remain blocked by pnpm unless a package is explicitly allowed and recorded here.
- Do not use `dangerouslyAllowAllBuilds`.
- Do not enable `trustPolicy: no-downgrade` repo-wide until we have a curated exception strategy; the Expo/Babel toolchain currently pulls legacy transitive packages that make the check too noisy for baseline installs.
- Avoid canary/nightly packages unless a critical product requirement justifies an exception and a decision is documented.
- Keep `pnpm-lock.yaml` committed after the first successful install.
- `TOKEN_PEPPER` is a secret and must be set through `.dev.vars` locally or Wrangler secrets in deployed environments. `ALLOWED_ORIGINS` is not secret, but production values must be narrow.

## Current dependency lifecycle review

All current direct dependencies in the root, mobile, and backend manifests were reviewed before the initial install. The table lists packages with lifecycle-relevant source scripts or notable security rationale; direct packages not listed individually had no install/postinstall scripts observed during review.

| Package | Version | Install/postinstall scripts | Notes |
| --- | ---: | --- | --- |
| `expo` | `55.0.25` | none | Source package has `prepare`, not install-time script from registry. |
| `expo-router` | `55.0.15` | none | Uses stable router tabs initially. |
| `@expo/ui` | `55.0.17` | none | Source package has `prepare`, not install-time script from registry. SDK 56 is required before `useNativeState` can be used safely. |
| `expo-glass-effect` | `55.0.11` | none | Runtime availability must be gated. |
| `expo-apple-authentication` | `55.0.13` | none | Source package has `prepare`, not install-time script from registry. |
| `expo-secure-store` | `55.0.14` | none | Source package has `prepare`, not install-time script from registry. |
| `react-native` | `0.83.6` | none | Source package has `prepack`, not install-time script from registry. |
| `react-dom` | `19.2.0` | none | Override only, to align transitive Expo peer resolution with React 19.2.0. |
| `react-native-worklets` | `0.7.4` | none | Pinned to the latest 0.7.x line compatible with `react-native-reanimated@4.2.1`; 0.8.x fails Reanimated's CocoaPods validation. |
| `wrangler` | `4.93.0` | none | Version selected to satisfy seven-day age gate. |
| `@cloudflare/workers-types` | `4.20260520.1` | none | Version selected to satisfy seven-day age gate. |
| `agent-device` | `0.15.1` | none | Source package has `prepack`, not install-time script from registry. Version selected to satisfy seven-day age gate and skill requirement. |
| `@types/react` | `19.2.15` | none | Required for React Native TypeScript type-checking. |
| `typescript` | `5.9.3` | none | Chosen to satisfy Expo SDK 55 peer ranges. |

## Install incident notes

- The first install attempt was blocked by pnpm `trustPolicy: no-downgrade` because `react-native-web` pulled `ua-parser-js@1.0.41` through `fbjs`, and pnpm reported that version as a trust downgrade. Because web is not a V1 target, `react-native-web` and `react-dom` were removed as app dependencies instead of adding a trust-policy exception.
- A second install attempt was blocked by the same trust policy on `semver@6.3.1` through Expo's Babel toolchain. The repo-wide trust policy was removed for now; the seven-day age gate and exotic-subdependency blocking remain active.
- pnpm ignored build scripts for `esbuild`, `sharp`, and `workerd`. They remain unapproved until a command proves they are required, at which point each script should be reviewed and recorded here before approval.
- Native iOS preview initially failed because `react-native-reanimated@4.2.1` rejected transitive `react-native-worklets@0.8.3`. The workspace pins `react-native-worklets@0.7.4`, which is older than seven days and has no install lifecycle scripts.
