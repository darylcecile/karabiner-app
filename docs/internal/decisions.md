# Decisions

Record significant product, architecture, security, and dependency decisions here. Prefer adding new entries over editing history.

## DEC-001: Use a pnpm monorepo

**Status:** Accepted

Karabiner uses a pnpm workspace with `apps/mobile`, `apps/backend`, and `packages/shared`.

**Why:** The mobile app and Cloudflare backend need shared protocol types for messages, blocks, widgets, slash commands, realtime envelopes, and plugin events. A monorepo keeps protocol evolution explicit and reviewable.

**Trade-offs:** Tooling has to handle Expo and Cloudflare in one workspace. We mitigate this with package-local scripts and shared TypeScript settings.

## DEC-002: Use Expo for the iOS/iPadOS app, with native escape hatches

**Status:** Accepted

The app starts as an Expo TypeScript app rather than a pure Swift app.

**Why:** Expo gives fast product iteration, native iOS capabilities, Expo Router, Sign in with Apple, and a route to SwiftUI-backed UI through `@expo/ui/swift-ui` or custom Expo modules when native fidelity requires it.

**Trade-offs:** Some latest native UI APIs are experimental or version-gated. We use stable APIs by default and document alpha API usage before adopting it.

## DEC-003: Start on Expo SDK 55-compatible packages until SDK 56 clears the package-age gate

**Status:** Accepted

The current official Expo docs describe SDK 56, but `expo@56.0.0` was published less than seven days before this setup session. The repository's supply-chain policy requires a seven-day minimum release age, so the initial install targets SDK 55-compatible versions where needed.

**Why:** The package-age gate is an explicit security requirement. Waiting for the cooldown or using SDK 55 is safer than excluding fresh runtime packages.

**Upgrade path:** Re-evaluate SDK 56 once all required Expo packages are older than seven days. Upgrade in one reviewed dependency PR with lifecycle script review, Expo's SDK upgrade flow, `pnpm check`, regenerated native build testing, and `agent-device` simulator/device inspection. Do not add package-age exclusions for routine SDK freshness.

## DEC-004: Use stable Expo Router tabs before adopting native tabs

**Status:** Accepted

Expo Router native tabs are documented as alpha/unstable. The first app shell uses stable Expo Router tabs and keeps the UI native-feeling through iOS spacing, materials, navigation titles, and glass-effect panels.

**Why:** Native tabs are promising for iOS fidelity but the alpha API may change. The app should remain maintainable while we establish product surfaces.

**Follow-up:** Prototype `expo-router/unstable-native-tabs` after the app can be tested with `agent-device`.

## DEC-005: Use Cloudflare Workers, Durable Objects, D1, R2, and Queues

**Status:** Accepted

The backend starts on Cloudflare:

- Workers for HTTP APIs.
- Durable Objects for room WebSocket coordination.
- D1 for relational app state.
- R2 for private media/object storage.
- Queues for async plugin dispatch and background work.

**Why:** The product is realtime, plugin-friendly, and edge-native. Cloudflare's primitives map well to chat rooms, private media, and integration dispatch without operating a separate server cluster.

**Trade-offs:** D1 has SQLite semantics and platform limits. If query, scale, or consistency requirements outgrow D1, write a new decision before migration.

**Setup note:** Keep Wrangler binding names stable (`DB`, `MEDIA_BUCKET`, `CHAT_ROOMS`, `PLUGIN_DISPATCH`) so code and docs stay aligned. Deployed environments must create Cloudflare resources explicitly and use Wrangler secrets for `TOKEN_PEPPER`.

## DEC-006: Use Sign in with Apple as the first identity provider

**Status:** Accepted

V1 account creation and sign-in are in-app through Sign in with Apple.

**Why:** The product is iOS/iPadOS-first, and Apple auth provides a platform-native, App Store-friendly onboarding path.

**Trade-offs:** The backend must verify Apple identity tokens and the user must configure Apple identifiers before production. No website is required for V1 account management.

## DEC-007: Use handles for UX and immutable IDs for authorization

**Status:** Accepted

Users are addressed by username/handle in product UI, but all storage, permissions, and protocol messages use immutable IDs.

**Why:** Handles are user-friendly and mutable. Immutable IDs prevent authorization bugs when handles change or collide.

## DEC-008: Treat OpenClaw integrations as scoped channel plugins

**Status:** Accepted

OpenClaw and similar AI agents connect as explicit plugin installations with manifests, scopes, slash commands, widgets, audit logs, and revocation.

**Why:** Agents need native app affordances without becoming unrestricted backend actors.

**Trade-offs:** Users must approve scopes and plugin builders must implement signed webhooks/protocols.

## DEC-009: Defer subscription tiers to V2

**Status:** Accepted

Subscription tiers such as managed OpenClaw instances and custom emoji packs are documented as V2.

**Why:** V1 should prove secure messaging, groups, threads, plugins, and native UX before adding entitlement complexity.

## DEC-010: Use SwiftUI composer input before adopting a chat UI SDK

**Status:** Accepted

The message composer uses Expo UI's SwiftUI `TextField` rather than React Native `TextInput`. `useNativeState` is deferred until the app can move to Expo SDK 56, because SDK 55's `@expo/ui` package does not expose that hook and mixing `@expo/ui@56` into the SDK 55 app fails at runtime.

**Why:** The composer is the highest-frequency interaction in the app and should track native iOS text input behavior and performance. This also creates a clean path for native text selection, inline decorations, `useNativeState`, and future SwiftUI-specific affordances after the SDK 56 upgrade clears the package-age gate.

**Alternatives considered:** Stream Chat Expo SDK and React Native Gifted Chat both provide useful chat primitives such as reactions, replies, and composers. We are not adopting either yet because Karabiner's backend is Cloudflare-native, messages are block/plugin/agent-protocol based, and a vendor chat SDK would either duplicate backend state or force a product-level backend decision too early.

**Follow-up:** Re-evaluate a native-looking chat SDK only if it can render Karabiner block messages, widgets, OpenClaw events, threads, reactions, and moderation affordances without giving up backend ownership.

## DEC-011: Use Telegram-inspired chat patterns with HIG constraints

**Status:** Accepted

Karabiner's chat timeline follows a Telegram-inspired interaction model while preserving iOS HIG fundamentals.

**Decision:** The default conversation timeline hides message action controls. Long-press opens a custom overlay with a dimmed backdrop, floating reaction strip, selected-message preview, and compact menu actions. Reaction chips only appear after a reaction is selected. Composer pickers follow Slack mobile patterns: search, category tabs, and a dense touch-friendly emoji grid.

**Why:** Persistent action rows made the app feel cluttered and non-native. Telegram's model keeps the timeline focused on messages while making reactions/actions discoverable through a familiar long-press interaction. Slack's emoji picker hierarchy is a stronger model for mobile scanning than large bordered emoji cards.

**Trade-offs:** This is a custom implementation rather than a full vendor chat SDK, so we must keep checking actual simulator screenshots against the target apps and HIG as features are added.

## DEC-012: Keep the conversation list flat and content-led

**Status:** Accepted

The main Chats screen should follow native iOS/WhatsApp-style list conventions: large title, native search affordance, flat system background, simple rows, text-column separators, and unread/timestamp accessories.

**Why:** The earlier custom filter chips, archive row, extra colored sections, and heavier typography made the screen feel Android-like and visually noisy. Chat lists are high-frequency navigation surfaces, so the content hierarchy should prioritize people, groups, last messages, timestamps, and unread state over secondary controls.

**Trade-offs:** Filters, archive access, and other chat management actions still matter, but they should return as native-feeling search scopes, edit actions, or overflow/navigation affordances only when the product flow needs them. Do not add prominent custom sections to the default list without another visual review.
