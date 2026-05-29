# Research log

Keep source-backed findings here as the stack evolves.

## Expo and iOS app foundation

- Expo's SwiftUI package is `@expo/ui`; SwiftUI views from `@expo/ui/swift-ui` must be wrapped in `Host`. Source: https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/
- Expo `GlassView` / `GlassContainer` render native iOS liquid glass through `expo-glass-effect`; `GlassView` is iOS 26+ and must be gated with runtime availability checks. Source: https://docs.expo.dev/versions/latest/sdk/glass-effect/
- Expo UI `TextField` mirrors SwiftUI `TextField` and supports `useNativeState` observable state for native-backed text input in SDK 56. The current SDK 55 package supports SwiftUI `TextField` but not `useNativeState`; attempting to mix `@expo/ui@56` with Expo SDK 55 built successfully but failed at runtime with `Cannot find native module 'ExpoUI'`. Source: https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/textfield/
- Expo Router native tabs use `expo-router/unstable-native-tabs` and are documented as alpha, with the API subject to change. Source: https://docs.expo.dev/router/advanced/native-tabs/
- Expo monorepos should use `pnpm-workspace.yaml`. SDK 54+ supports isolated dependencies better, but duplicate React/React Native versions in one app remain a risk. Source: https://docs.expo.dev/guides/monorepos/
- Sign in with Apple in Expo uses `expo-apple-authentication`; iOS apps need `usesAppleSignIn` and the config plugin/entitlement. Source: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- Expo recommends SDK upgrades one version at a time: install the target `expo` version, run `expo install --fix` and `expo-doctor`, update native projects, then follow release notes. Source: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/

## Cloudflare backend foundation

- Durable Objects can serve thousands of WebSocket clients per instance and Cloudflare recommends the Hibernation WebSocket API for idle cost reduction. Attachments are needed to restore per-socket state after hibernation. Source: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- D1 is Cloudflare's managed SQLite-semantics database with Time Travel and read replication. Source: https://developers.cloudflare.com/d1/
- D1 databases are created with Wrangler and the generated `database_id` is wired into Wrangler config bindings. Source: https://developers.cloudflare.com/d1/get-started/
- R2 is Cloudflare object storage. Private buckets and bucket-scoped controls are preferred for user media. Source: https://developers.cloudflare.com/r2/
- R2 buckets are private by default and can be created with `wrangler r2 bucket create`. Source: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Queues support guaranteed delivery, retries, batching, and Worker-to-Worker async work. Source: https://developers.cloudflare.com/queues/
- Queues are created with Wrangler and connected to Workers through producer/consumer bindings. Source: https://developers.cloudflare.com/queues/get-started/

## Supply-chain findings

- pnpm documents `minimumReleaseAge` as a mitigation for compromised fresh package releases. The seven-day policy is represented as `10080` minutes. Source: https://pnpm.io/supply-chain-security
- pnpm v10+ blocks automatic dependency postinstall scripts by default unless builds are explicitly allowed. We should keep explicit allowlists small and documented.
- At setup time, Expo SDK 56 was current, but the core stable `expo@56.0.0` package had not yet cleared the seven-day age gate. SDK 55-compatible versions were selected to avoid bypassing the policy.
- During install, pnpm blocked `ua-parser-js@1.0.41` as a trust downgrade pulled by `react-native-web`. Since web is out of V1 scope, web dependencies were removed rather than excluded from trust policy.
- pnpm also blocked `semver@6.3.1` through Expo/Babel under `trustPolicy: no-downgrade`. That policy is too noisy for the current Expo transitive dependency graph, so it is not enabled repo-wide yet. Keep the seven-day age gate and revisit trust policy with curated exceptions.
- `expo install --check` currently asks for `expo@~55.0.26` and `expo-router@~55.0.16`, both published less than seven days before setup. The app intentionally stays on the previous compatible patch versions until those versions pass the age gate.
- Xcode 26.5 was installed with the iOS 26.5 SDK but initially lacked the iOS 26.5 simulator runtime. `xcodebuild -downloadPlatform iOS` installed the matching iOS 26.5 simulator runtime.
- `react-native-reanimated@4.2.1` supports `react-native-worklets` 0.7.x or older. Expo's transitive graph resolved 0.8.3, causing CocoaPods validation to fail. The workspace pins `react-native-worklets@0.7.4`.
- Expo Go on the iOS simulator could not connect to Metro when opened with `exp://127.0.0.1:8081`; Metro was listening on IPv6 localhost only (`[::1]`) and the simulator attempted an IPv4 bundle URL. Restarting Expo with LAN hosting and opening `exp://<LAN IP>:8081` allowed agent-device screenshots to load the app. Also note that several interactive agent-device iOS commands failed because the XCUITest runner build was stale, while screenshot/open/metro reload still worked.

## Chat UI libraries

- Stream's Expo SDK supports Expo SDK 52+ with the New Architecture, includes channel list/message/thread primitives, reactions, composer, and moderation-oriented chat features, but it is tied to Stream's chat client/backend model and requires several peer dependencies. Source: https://getstream.io/chat/sdk/react-native/tutorial/expo/
- React Native Gifted Chat is Expo-compatible and offers customizable chat UI, composer actions, reply-to-message, message status, avatars, quick replies, and TypeScript definitions. It is useful as a design/prototype reference, but its generic cross-platform UI still needs heavy customization for strict iOS HIG adherence. Source: https://github.com/FaridSafi/react-native-gifted-chat

## Chat design audit

- Telegram iOS-style chat should keep the normal timeline quiet: message actions and quick reactions appear after long-press, not persistently under every message. The context state should dim the chat, elevate the selected message, show a floating reaction strip, then a compact icon+label menu for Reply, Quote, Edit, and Delete.
- Telegram-like message rows need compact bubble geometry, asymmetric bubble tails, subtle shadows, sender labels only where helpful, and a calmer wallpaper. Oversized orb backgrounds and huge empty header spacing make the app feel less native.
- Slack mobile emoji picker patterns emphasize a search row, category tabs, frequently-used grid, 44pt touch targets, and light overlay/panel depth. Heavy bordered emoji cards and large textual labels are not Slack-like on mobile.
- Apple HIG reinforces minimum 44pt touch targets, semantic colors, restrained hierarchy, native navigation/back affordances, and avoiding decorative borders/padding when system grouping and material depth can carry structure.
- Latest iOS/Liquid Glass guidance treats navigation bars, tab bars, search, and toolbars as the functional layer; content should remain calm and content-led underneath. Overusing custom gray slabs or boxed sections in the content layer fights the system look. Sources: https://developer.apple.com/documentation/technologyoverviews/liquid-glass, https://developer.apple.com/design/human-interface-guidelines/materials, https://developer.apple.com/design/human-interface-guidelines/tab-bars/
- iOS conversation lists should use a flat system background, leading avatars around the 40-44pt range, title/preview/timestamp hierarchy, separators inset to the text column, and unread badges only when needed. Secondary controls such as filters and archive shortcuts should not appear as prominent custom sections unless they are central to the task.
- The current visual baseline was checked on the iPhone 17 simulator with `agent-device` screenshots. The accepted direction removes the custom filter/Archived section from the chat list, keeps the search row as the only list-level control, and uses contextual message actions only after long-press.
