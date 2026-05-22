# PRD Appendix: Library and Framework Research

Last updated: 2026-05-22

## 1. Context and decision principles

This appendix supports the native iPadOS agentic IDE described in `docs/PRD.md`. The product should feel native, keep the iPad app as a secure control plane, and avoid rebuilding mature infrastructure unless the iPad-specific UX requires it.

Selection principles:

1. Prefer Apple-native frameworks when they provide the best iPadOS behavior, App Store compliance, accessibility, or security posture.
2. Prefer permissive open-source licenses: MIT, Apache-2.0, BSD-style. Treat GPL/commercial-only code as a last resort.
3. Avoid webview shells for core editor/review UX. Use `WKWebView` only for project previews, trusted rendered artifacts, and web-native formats such as Mermaid.
4. Keep arbitrary project execution remote or user-owned. Do not add terminal/build libraries that imply local iPad execution of downloaded code.
5. Choose libraries with active maintenance signals, CI, Swift Package Manager support, iOS/iPadOS support, and small transitive dependency graphs.
6. Design adapters so high-risk dependencies can be replaced: editor adapter, Git adapter, Markdown renderer, SSH transport, telemetry sink, provider API client.

## 2. Recommended stack at a glance

| Area | Primary recommendation | Why this is the default | Avoid/revisit |
| --- | --- | --- | --- |
| App shell | SwiftUI + UIKit where needed | Best native iPad UX, multitasking, menus, keyboard, Pencil, accessibility | Cross-platform UI shells for core app |
| Editor | Runestone + Tree-sitter, with a planned fork boundary | iOS/iPadOS code editor with line numbers, regex search, syntax, indentation, wrapping, and Tree-sitter parsing | Monaco/CodeMirror in a webview for core editing |
| Text engine fallback | UIKit/TextKit 2 custom surface | Required if Runestone cannot meet inline diff, diagnostics, accessibility, or large-file requirements | GPL-only TextKit components without commercial/legal approval |
| Syntax parsing | Tree-sitter core + selected grammars | Incremental parsing, broad language ecosystem, MIT license | Regex-only highlighting as the long-term editor strategy |
| Git | GitHub APIs first; libgit2/SwiftGit2 for limited local/offline Git | GitHub remains source of truth; libgit2 can power local status/diff/commit when feasible | A full local Git CLI/runtime on iPad |
| Markdown | swift-markdown parser + native SwiftUI renderer; MarkdownUI where useful | Native AST, safe rendering, good chat/docs fit | Rendering untrusted Markdown through arbitrary HTML without sanitization |
| Diff/review | Custom native SwiftUI/UIKit diff UI backed by GitHub diff data, libgit2 diffs, and small utility diff libraries | Review UX is differentiating and needs comments, hunk actions, provenance, checks | Off-the-shelf web diff widgets as the core review UI |
| Terminal/SSH | SwiftTerm + SwiftNIO SSH or libssh2 wrapper for user-owned runtimes | Native terminal emulator plus Swift network building blocks | Pretending iPad has a local shell for project code |
| Networking | URLSession, Swift OpenAPI Generator, Apollo iOS for GraphQL where useful | Native, async/await-friendly, minimal dependency risk | Large generic networking stacks unless a provider requires them |
| Auth/secrets | AuthenticationServices + Keychain; AppAuth/Valet only for gaps | Secure native OAuth surfaces and hardware-backed storage | Embedded web login views or hardcoded client secrets |
| Persistence | GRDB + SQLite/FTS5; SwiftData only for simple metadata | Mature migrations, concurrency, FTS, predictable cache behavior | Replacing SQLite with opaque object persistence for indexes/diffs |
| Search/indexing | SQLite FTS5 + GitHub search/code search + provider indexes | Works offline for cache and scales via GitHub for remote repos | Building an on-device universal code-search engine in V1 |
| Canvas/diagrams | SwiftUI Canvas, PencilKit, Mermaid in sandboxed `WKWebView` | Native annotation plus proven text-to-diagram rendering | Heavy web whiteboard as primary workspace |
| Previews | WKWebView, SFSafariViewController, QuickLook, PDFKit | Best App Store posture for remote previews/artifacts | In-app build/preview proxy for arbitrary apps in V1 |
| State/design system | SwiftUI, SF Symbols, HIG; evaluate TCA for complex state | Native design quality and testable feature modules | Adding a framework before state boundaries are clear |
| Testing | XCTest/XCUITest, Swift Testing, SnapshotTesting, ViewInspector, Nimble as needed | Strong native test stack and UI regression coverage | Dependency-heavy test stacks that do not run on CI/iPad targets |
| Telemetry/crash | OSLog + MetricKit; optional Sentry Cocoa | Privacy-preserving local diagnostics and mature crash reporting | Telemetry SDKs that weaken privacy or App Store disclosures |

## 3. Detailed recommendations

### 3.1 Native app shell and platform foundations

**Recommendation: SwiftUI app shell with UIKit escape hatches, Observation, Swift Concurrency, and Apple's pro iPad frameworks.**

- **Solves:** Primary navigation, split views, inspectors, command menus, keyboard shortcuts, drag/drop, Stage Manager, external display, sheets, settings, and system accessibility.
- **Maturity and maintenance:** Apple-owned, first-party, continuously maintained with iPadOS. SwiftUI is the best default for app composition; UIKit remains necessary for pro text editing, input handling, menus, pointer interaction, document workflows, and custom scrolling.
- **License:** Apple platform SDK. No third-party license, but bound by Apple developer agreements and platform availability.
- **Fit for iPadOS:** Excellent. It is the only path that fully uses iPad multitasking, Pencil, hardware keyboard discovery, pointer, Dynamic Type, VoiceOver, Keychain, FileProvider, and App Review expectations.
- **Alternatives:** React Native, Flutter, web/PWA shells, Catalyst-first UI.
- **Risks:** SwiftUI can struggle with highly synchronized editor/diff scroll surfaces, complex focus, and huge lists. UIKit/TextKit 2 work will be required in editor, diff, terminal, and document surfaces.
- **Integration notes:** Keep core feature state and networking in Swift packages independent of SwiftUI. Wrap UIKit editor/terminal/diff views with `UIViewRepresentable` only at the edges. Adopt `@MainActor`, structured concurrency, cancellation, and backpressure for logs/agent streams.

**Supporting packages: Swift Collections, Swift Algorithms, Swift Async Algorithms, Swift Crypto, Swift Log, Swift Metrics.**

- **Solves:** Ordered dictionaries/sets, deques, efficient collections, common algorithms, async stream transforms, portable cryptography APIs, structured logging, and metrics interfaces.
- **Maturity and maintenance:** Apple-hosted packages with active repositories and recent updates. Most use Apache-2.0 and have broad Swift ecosystem adoption.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Good. They are Swift Package Manager-compatible and avoid large runtime dependencies.
- **Alternatives:** Custom data structures, Combine-only stream utilities, third-party logging/metrics wrappers.
- **Risks:** Metrics/logging packages are interfaces; they still need a backend or sink. Swift Crypto duplicates parts of CryptoKit on Apple platforms, so prefer CryptoKit directly unless shared code needs the package.
- **Integration notes:** Use `OrderedDictionary` for stable file trees and diff hunks, `Deque` for log ring buffers, `AsyncAlgorithms` for debounce/throttle/merge of provider events, `SwiftLog` as the app-wide logging facade, and OSLog/MetricKit/Sentry as sinks.

### 3.2 Code editor, syntax highlighting, and Tree-sitter

**Recommendation: Start with Runestone and budget for a controlled fork.**

- **Solves:** Native iOS/iPadOS source editor features: syntax highlighting, line numbers, selected-line highlight, invisible characters, paired characters, colors/fonts, wrapping, overscroll, highlighted ranges, regex search, indentation detection, and line-ending detection.
- **Maturity and maintenance:** Runestone is an iPhone/iPad-focused framework used by the Runestone App Store app. Its repository shows active CI badges, DocC docs, Swift Package Index badges, ~3.1k GitHub stars, and recent updates. It uses Tree-sitter for incremental parsing.
- **License:** MIT.
- **Fit for iPadOS:** Strong. It is built specifically for iOS/iPadOS, not ported from desktop or web.
- **Alternatives:** Custom TextKit 2 editor, STTextView, Highlightr/Splash-style highlighting over `UITextView`, Monaco/CodeMirror in `WKWebView`.
- **Risks:** The agentic IDE needs inline diffs, diagnostics, comments, blame, provenance, multi-cursor-like workflows, huge-file safeguards, accessibility semantics, and synchronized review overlays. Runestone may require a fork to support these deeply.
- **Integration notes:** Create an `EditorEngine` protocol from day one. Isolate Runestone behind adapter types for document model, theme, grammar, decorations, search, diagnostics, and selection. Keep a fork plan for line model performance, accessibility, and inline hunk rendering.

**Recommendation: Use Tree-sitter core plus a curated grammar set.**

- **Solves:** Incremental parse trees for syntax highlighting, symbol outlines, bracket/range features, basic structural search, Markdown code fences, and future semantic decoration.
- **Maturity and maintenance:** Tree-sitter is a mature MIT-licensed parser system with a very large ecosystem and active upstream. Runestone already integrates it. `simonbs/TreeSitterLanguages` wraps selected grammars for Swift Package Manager, but has a smaller maintenance footprint than Tree-sitter core.
- **License:** Tree-sitter core is MIT. Individual grammars vary and must be audited one by one; most popular grammars are MIT, Apache-2.0, or similar, but do not assume.
- **Fit for iPadOS:** Good if grammars are compiled into the app or shipped as reviewed resources. Do not download executable grammars after App Review.
- **Alternatives:** Regex/TextMate grammars, Apple SourceKit for Swift-only parsing, remote LSP via Codespaces/user runtimes.
- **Risks:** Grammar size can bloat the app. Dynamic grammar loading may create App Store risk. Tree-sitter gives syntax structure, not full type-aware LSP intelligence.
- **Integration notes:** Ship a V1 grammar allowlist: Swift, TypeScript/JavaScript/TSX/JSX, Python, Go, Rust, Ruby, Java/Kotlin, JSON, YAML, Markdown, HTML/CSS, SQL, shell, Dockerfile. Put every grammar in a license manifest. Use remote/provider LSP only where an official remote runtime exposes it.

**Recommendation: Keep TextKit 2 as the fallback/custom-editor path.**

- **Solves:** Deep control over text layout, selection, attachments, custom glyph/line decorations, bidirectional text, accessibility, and complex inline review surfaces.
- **Maturity and maintenance:** Apple TextKit 2 is the native text system direction. Apple samples document custom text interactions, selection, and text elements.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent but expensive. It can support the exact native feel required for a pro editor.
- **Alternatives:** Continue with a Runestone fork; STTextView as a reference or commercial component; web editors.
- **Risks:** Building a source editor is a multi-quarter project. TextKit 2 still has edge cases and requires extensive benchmark/accessibility testing.
- **Integration notes:** Treat the custom editor as a replaceable implementation of `EditorEngine`, not a rewrite of workspace state. Reuse Tree-sitter grammars, themes, search model, and decoration model from the Runestone phase.

**Non-default alternative: STTextView.**

- **Solves:** A performant TextKit 2 `UITextView`/`NSTextView` replacement with line numbers and pro text features.
- **Maturity and maintenance:** Active repository with recent commits and meaningful adoption.
- **License:** GPLv3 for open-source use or commercial license for proprietary apps; GitHub's license detection reports `NOASSERTION`.
- **Fit for iPadOS:** Technically good, but licensing is not a default fit for a proprietary App Store product.
- **Alternatives:** Runestone MIT, custom TextKit 2.
- **Risks:** GPLv3/commercial terms require legal/business approval. Do not accidentally import it as a dependency.
- **Integration notes:** Use only as a design/reference dependency unless a commercial license is purchased and legal approves distribution.

### 3.3 Git, GitHub, and source control

**Recommendation: Use GitHub REST/GraphQL APIs as the source-of-truth Git layer.**

- **Solves:** Repository browsing, branches, commits, contents, PRs, reviews, checks, Actions logs, issues, code search, merge state, merge queues, comments, and Copilot task outputs without cloning every repository.
- **Maturity and maintenance:** Official GitHub APIs with extensive docs and stable ecosystem usage. GraphQL is more precise for combined repository/PR/review queries; REST remains necessary for many endpoints.
- **License:** API terms, not a code library. Client code should be ours or generated from official OpenAPI descriptions.
- **Fit for iPadOS:** Excellent. Avoids on-device process execution, scales for large repos, and aligns with the PRD's GitHub-native execution model.
- **Alternatives:** Full local clone with libgit2; Codespaces API/deep links; provider-specific Git surfaces.
- **Risks:** Rate limits, incomplete endpoint coverage, inconsistent pagination, large file limits, search result caps, and offline limitations.
- **Integration notes:** Build a GitHub data layer with ETags, pagination, retry/backoff, secondary-rate-limit handling, and a normalized domain model. Cache immutable blobs by SHA and mutable views by branch/ref. Use GraphQL for PR/review/check dashboards and REST for contents, diffs, Actions, and task endpoints as needed.

**Recommendation: Use libgit2 directly or through SwiftGit2 only for limited local/offline Git.**

- **Solves:** Local status, diff, commit metadata, branch refs, merge-base, patch generation, conflict inspection, and offline drafts for cached workspaces.
- **Maturity and maintenance:** libgit2 is mature, widely used, cross-platform, and actively maintained. SwiftGit2 is MIT and provides Swift bindings, but its README still references Swift 5.3/Carthage-era setup even though the repo has recent activity; treat it as a convenience layer to evaluate, not a guaranteed long-term abstraction.
- **License:** libgit2 is GPLv2 with a linking exception; SwiftGit2 is MIT. Legal should review libgit2's license and any SSH/crypto transitive dependencies.
- **Fit for iPadOS:** Feasible for library-style operations because it is linkable C code, not a local `git` executable. It must not become a way to run arbitrary hooks or downloaded tools.
- **Alternatives:** GitHub-only diffs, a custom pure-Swift Git subset, provider-hosted Git operations, Working Copy-style document handoff.
- **Risks:** Git LFS, submodules, credential helpers, hooks, sparse checkouts, partial clones, and repository size are complex. Static linking, OpenSSL/libssh2, and App Store privacy manifests need care.
- **Integration notes:** Scope V1 local Git to safe read/diff/commit operations on user-selected cached files. Disable hooks. Prefer GitHub server-side branch creation and PR updates. Keep credentials in Keychain and route network fetch/push through approved GitHub APIs unless a user explicitly enables local clone mode.

### 3.4 Markdown, chat rendering, docs, and rich text

**Recommendation: Use `swift-markdown` as the canonical Markdown parser.**

- **Solves:** Parsing, building, editing, and analyzing Markdown for chat transcripts, PR descriptions, issue bodies, AGENTS.md/instructions, task plans, docs previews, and source notes.
- **Maturity and maintenance:** Apple/Swift project with active development, Apache-2.0 license, and thousands of stars. It is the best native Swift Markdown AST option.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Strong. Native parsing avoids webview security issues and lets us render accessible SwiftUI/UIKit components.
- **Alternatives:** MarkdownUI, Ink, Down/cmark wrappers, GitHub-rendered Markdown HTML.
- **Risks:** GitHub Flavored Markdown parity is not automatic. Tables, task lists, footnotes, alerts, and HTML passthrough need policy decisions.
- **Integration notes:** Keep a normalized Markdown AST pipeline: parse with `swift-markdown`, sanitize raw HTML, render native components, and optionally request GitHub-rendered Markdown only for exact GitHub previews.

**Recommendation: Use MarkdownUI or a small native renderer where speed matters.**

- **Solves:** SwiftUI rendering of Markdown documents, chat messages, plans, and help content without building every block renderer upfront.
- **Maturity and maintenance:** `gonzalezreal/swift-markdown-ui` has strong adoption and MIT license, but its README now says maintenance mode with new development moving to Textual.
- **License:** MIT.
- **Fit for iPadOS:** Good for non-editor Markdown views and prototypes.
- **Alternatives:** Custom renderer over `swift-markdown`, `AttributedString(markdown:)`, WebKit-rendered Markdown, Textual if it matures.
- **Risks:** Maintenance-mode status makes it risky as a deep platform dependency. Styling complex GitHub Markdown may require custom blocks anyway.
- **Integration notes:** Use behind a `MarkdownRenderer` protocol. For V1, prefer custom renderers for chat messages, code fences, task lists, source citations, and security-sensitive HTML handling.

### 3.5 Diff, review, comments, and merge UX

**Recommendation: Build a native diff/review UI, using libraries only for algorithms and parsing support.**

- **Solves:** Side-by-side and unified diffs, inline comments, pending review drafts, accepted/rejected hunks, conflict panes, syntax-aware hunks, checks annotations, agent provenance, Pencil annotations, and keyboard navigation.
- **Maturity and maintenance:** There is no obvious permissive, iPad-native, full GitHub PR review component that meets the PRD. GitHub API diff data, libgit2 patch data, Tree-sitter highlighting, SwiftUI/UIKit list virtualization, and small utility diff algorithms are the safer base.
- **License:** First-party app code; supporting packages should be MIT/Apache-2.0. Swift Collections/Algorithms are Apache-2.0. Any diff-match-patch implementation must be license-reviewed.
- **Fit for iPadOS:** Excellent if native. This is a core differentiator and should not be a web widget.
- **Alternatives:** GitHub web PR in `SFSafariViewController`, embedded web diff widget, DifferenceKit for collection animations, libgit2 patch rendering.
- **Risks:** Large diffs can hurt memory and scroll performance. Review comments must map to GitHub's exact diff positions. Conflict resolution is complex and must never silently overwrite work.
- **Integration notes:** Create a canonical `DiffModel` with file/hunk/line/comment/provenance/check identifiers. Store original GitHub positions, new-file line numbers, blob SHAs, and patch IDs. Virtualize rows, lazy-highlight visible hunks, and keep GitHub web deep links as fallback.

**Recommendation: Treat `@pierre/diffs` and PierreDiffsSwift as high-quality references/prototypes, not the default core iPad diff engine.**

- **Solves:** `@pierre/diffs` is a polished Apache-2.0 JavaScript/React diff and code rendering library with Shiki syntax highlighting, split/unified layouts, inline highlights, line selection, annotations, custom headers, merge-conflict primitives, and theme adaptation. PierreDiffsSwift wraps it in SwiftUI through `WKWebView`.
- **Maturity and maintenance:** `@pierre/diffs` lives in the active `pierrecomputer/pierre` monorepo, which had ~4.6k stars and very recent activity when checked; the npm package was recently published at v1.2.2. PierreDiffsSwift is newer and smaller, with ~31 stars, recent activity, and MIT license.
- **License:** `@pierre/diffs` Apache-2.0; PierreDiffsSwift MIT.
- **Fit for iPadOS:** Useful as a design reference and possible prototype for diff rendering, but not an immediate V1 core dependency. The official Pierre package is web/JS-first; PierreDiffsSwift currently declares `.macOS(.v14)` only and bundles a JavaScript build into `WKWebView`.
- **Alternatives:** Native SwiftUI/UIKit diff UI, GitHub web PR fallback, libgit2 patch rendering, Tree-sitter-highlighted native hunks.
- **Risks:** Core review UX in a webview can weaken native accessibility, keyboard/Pencil integration, performance predictability, App Store review posture, and hunk/comment mapping control. Bundled JavaScript/Shiki adds app size and supply-chain surface. The Swift wrapper would need iPadOS support and a deeper audit before adoption.
- **Integration notes:** Use Pierre as a benchmark for visual quality, theme adaptation, annotations, line selection, and merge-conflict UX. If prototyped, isolate behind `DiffRenderer`, disable network access, bundle pinned assets, audit licenses/transitives, benchmark giant diffs on iPad, and keep a native fallback.

### 3.6 Terminal, SSH, remote commands, and log streaming

**Recommendation: Use SwiftTerm for terminal rendering.**

- **Solves:** VT100/xterm terminal emulation, ANSI colors, Unicode/graphemes, selection/search APIs, iOS UIKit frontend, optional Metal rendering, and session recording/playback primitives.
- **Maturity and maintenance:** Active MIT repository, used by commercial SSH clients and CodeEdit, with iOS sample app. It explicitly notes iOS has no native shell and uses SSH for remote connections.
- **License:** MIT.
- **Fit for iPadOS:** Strong for remote terminal surfaces, logs, and user-owned runtime shells.
- **Alternatives:** xterm.js in `WKWebView`, custom terminal view, provider web terminals/Codespaces web.
- **Risks:** Terminal accessibility, keyboard mapping, paste safety, and command approval UX need product work. A terminal view can imply local execution if copy is unclear.
- **Integration notes:** Label all terminal sessions by runtime: Codespaces, SSH host, OpenCode server, Claude/Codex remote, Actions log, etc. Add paste bracketing/warnings, command history audit, and redaction before transcript persistence.

**Recommendation: Use SwiftNIO SSH for Swift-native SSH building blocks; evaluate libssh2 wrappers only if client ergonomics require it.**

- **Solves:** SSHv2 protocol support, shell/exec channels, port forwarding, password/public-key auth, and a foundation for trusted user-owned runtimes.
- **Maturity and maintenance:** Apple SwiftNIO project, Apache-2.0, active. Its README is explicit: it provides building blocks, not production-ready SSH clients/servers.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Good as a Swift package when combined with Keychain-managed keys and SwiftTerm. It avoids spawning an `ssh` process.
- **Alternatives:** Shout/libssh2, NMSSH, provider-specific web terminals, Tailscale/HTTPS runtime bridge.
- **Risks:** Building a polished SSH client is still substantial: known hosts, key formats, agent forwarding decisions, port forwarding policy, terminal resize, keepalive, reconnect, and audit.
- **Integration notes:** Treat SSH as a runtime adapter. Store keys in Keychain/Secure Enclave where possible, maintain known-host fingerprints, show trust prompts, and restrict forwarding/network features by policy.

**Recommendation: Use URLSession async streams and provider APIs for logs before inventing a streaming backend.**

- **Solves:** GitHub Actions logs, Checks annotations, provider task status, SSE/WebSocket streams where available, and retryable polling.
- **Maturity and maintenance:** First-party Foundation APIs.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent and background-friendly when paired with resumable polling and local persistence.
- **Alternatives:** SwiftNIO for every HTTP connection, Starscream for WebSockets, a custom relay backend.
- **Risks:** Provider APIs may not expose raw streaming logs. Background execution is limited on iPadOS.
- **Integration notes:** Use a provider event normalization layer with polling, ETag, incremental cursors, and local durable append-only logs. Add APNs/webhook relay only when product requirements demand it.

### 3.7 Networking, GitHub/provider API clients, and data transport

**Recommendation: Use URLSession as the default HTTP stack.**

- **Solves:** REST calls, downloads/uploads, OAuth token exchange, GraphQL POSTs, SSE-like long polling where supported, background transfers, cookies only when explicitly needed, and TLS integration.
- **Maturity and maintenance:** Apple first-party, async/await support, battle-tested.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent.
- **Alternatives:** Alamofire, AsyncHTTPClient/SwiftNIO, custom cURL/libcurl.
- **Risks:** Handwritten clients can drift from provider APIs. Large file transfer and retry policies must be standardized.
- **Integration notes:** Build a shared `HTTPClient` with auth injection, request signing where needed, rate-limit handling, structured errors, JSON decoding strategies, privacy-safe logging, and cancellation.

**Recommendation: Use Swift OpenAPI Generator for provider specs that are stable enough.**

- **Solves:** Typed REST clients from OpenAPI documents, reducing boilerplate and schema drift.
- **Maturity and maintenance:** Apple-hosted Apache-2.0 package with active repository; `swift-openapi-urlsession` supplies URLSession transport.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Good; generated Swift clients can live in separate packages.
- **Alternatives:** Handwritten endpoint clients, OpenAPI Generator Java templates, provider SDKs.
- **Risks:** GitHub's OpenAPI surface is large and may generate unwieldy code. Some provider APIs use preview headers, custom pagination, or streaming not modeled cleanly.
- **Integration notes:** Generate only bounded clients per provider/domain where useful. Keep manual wrappers around pagination, ETags, previews, and error normalization.

**Recommendation: Use Apollo iOS for GraphQL if GitHub GraphQL usage grows beyond a handful of queries.**

- **Solves:** Strongly typed GraphQL operations, normalized cache, codegen, and safer query evolution for GitHub GraphQL dashboards.
- **Maturity and maintenance:** Active MIT project with ~4k stars and recent updates.
- **License:** MIT.
- **Fit for iPadOS:** Good, but it adds codegen and build complexity.
- **Alternatives:** Raw URLSession GraphQL calls, generated lightweight operation structs, GraphQL-request-only helper.
- **Risks:** Overkill if GraphQL is small. Cache semantics can conflict with our SQLite cache if not carefully bounded.
- **Integration notes:** Start with raw GraphQL for early prototypes. Add Apollo when query count and schema validation justify it. Keep Apollo cache separate from durable workspace cache or disable normalized caching.

### 3.8 OAuth, identity, secrets, and secure storage

**Recommendation: Use AuthenticationServices for OAuth/web auth and Keychain for token storage.**

- **Solves:** GitHub login, provider login, SSO/SAML handoff, secure browser session, callback handling, and system-consistent auth UX.
- **Maturity and maintenance:** Apple first-party. `ASWebAuthenticationSession` is the standard native web-auth surface.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent and App Review-friendly.
- **Alternatives:** AppAuth-iOS, provider SDKs, custom embedded webviews.
- **Risks:** Some providers have special device-code or app-link flows. OAuth refresh-token and SSO policies vary. No client secret should ship in the app.
- **Integration notes:** Use PKCE where supported, validate state, prefer universal links/custom URL schemes as providers allow, and store tokens only in Keychain. Model token scopes and provider capability manifests separately.

**Recommendation: Add AppAuth-iOS only if provider complexity exceeds direct AuthenticationServices flows.**

- **Solves:** OAuth 2.0/OpenID Connect flow handling, discovery documents, token exchange, refresh, and standards-based edge cases.
- **Maturity and maintenance:** OpenID Foundation project, Apache-2.0, active repository. Apple lists AppAuth among SDKs requiring privacy manifest/signature attention when used as a third-party SDK.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Good. It uses the native browser auth patterns but adds a dependency.
- **Alternatives:** Direct `ASWebAuthenticationSession` and URLSession token exchange; provider SDKs.
- **Risks:** Adds privacy-manifest obligations and dependency surface. Not needed for simple GitHub flows.
- **Integration notes:** Gate behind an `OAuthProvider` abstraction. If added, audit privacy manifest, callback handling, token refresh storage, and provider-specific logout/revoke behavior.

**Recommendation: Use Valet or KeychainAccess only as a thin Keychain ergonomics layer if needed.**

- **Solves:** Less verbose Keychain read/write, access groups, synchronizable items, and secure storage ergonomics.
- **Maturity and maintenance:** Valet is Apache-2.0, Square-maintained, active. KeychainAccess is MIT and popular but had less recent activity than Valet in the metadata checked.
- **License:** Valet Apache-2.0; KeychainAccess MIT.
- **Fit for iPadOS:** Good.
- **Alternatives:** Direct Security framework wrapper owned by us.
- **Risks:** Token storage is security-critical; wrappers can obscure access-control flags or migration behavior.
- **Integration notes:** Prefer a small in-house `SecretsStore` protocol and implementation. If using Valet/KeychainAccess, pin versions, test migration/revoke/delete, and document Keychain accessibility classes.

### 3.9 Persistence, caches, and sync

**Recommendation: Use GRDB with SQLite as the durable local data layer.**

- **Solves:** Workspace cache, repository metadata, file snapshots, diff models, transcripts, task IDs, provider status, search indexes, FTS5, migrations, concurrency, and recovery after app termination.
- **Maturity and maintenance:** GRDB is a mature, active MIT project with ~8k stars and strong Swift adoption.
- **License:** MIT.
- **Fit for iPadOS:** Excellent. SQLite is built into iOS, efficient, debuggable, and works offline.
- **Alternatives:** SwiftData/Core Data, SQLite.swift, Realm, raw SQLite C API.
- **Risks:** Schema design and migrations are our responsibility. Large blob storage in SQLite can hurt performance if not separated.
- **Integration notes:** Store large file contents/artifacts on disk by content hash, with SQLite metadata. Use WAL, migrations, FTS5 tables, and actor-isolated database access. Encrypt only if product/security requirements demand it; tokens stay in Keychain.

**Recommendation: Use SwiftData only for simple app metadata, not core IDE indexes.**

- **Solves:** Simple settings, recents, small user preferences, and SwiftUI-friendly models.
- **Maturity and maintenance:** Apple first-party and improving, but less transparent than direct SQLite for complex indexes and migrations.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Good for small data; weaker fit for large caches/search/diff state.
- **Alternatives:** GRDB for everything, Core Data, UserDefaults for tiny preferences.
- **Risks:** Opaque persistence behavior can make recovery and migration harder.
- **Integration notes:** If used, keep it outside core repository/session storage. Do not split critical workspace state across two databases without a clear ownership map.

### 3.10 Search, indexing, and project intelligence

**Recommendation: Combine SQLite FTS5, GitHub search/code search, Tree-sitter outlines, and provider indexes.**

- **Solves:** Local cached-file search, transcript search, PR/comment search, symbol-ish outlines, command palette, and large remote repository search without cloning everything.
- **Maturity and maintenance:** SQLite FTS5 is stable; GitHub Search APIs are official but rate-limited; Tree-sitter is mature for structural outlines.
- **License:** SQLite is public domain; GitHub API terms; Tree-sitter MIT.
- **Fit for iPadOS:** Strong. Keeps local work responsive and offloads remote scale to GitHub/provider APIs.
- **Alternatives:** Tantivy/Lucene ports, SourceKit-LSP on device, remote custom indexing service, local ripgrep.
- **Risks:** GitHub code search API requires auth and has tight rate limits; FTS5 is lexical, not semantic; symbol accuracy varies by grammar.
- **Integration notes:** Store index freshness by repo/ref/blob SHA. Label result provenance: local cache, GitHub repository, PR diff, Actions log, provider transcript. Add semantic search later through provider-hosted embeddings or a thin backend if privacy and cost are resolved.

**Recommendation: Use NaturalLanguage/Core ML only for lightweight on-device classification, not V1 code embeddings.**

- **Solves:** Language detection, simple text ranking, command suggestions, and privacy-preserving local heuristics.
- **Maturity and maintenance:** Apple first-party.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Good for small assistive features.
- **Alternatives:** Provider embeddings, local vector databases, custom ML models.
- **Risks:** On-device semantic code search can become large, battery-intensive, and privacy-sensitive.
- **Integration notes:** Keep V1 semantic retrieval provider-backed or backend-backed. Do not ship large model assets unless there is a measured UX win and App Store/privacy review.

### 3.10.1 File tree UI

**Recommendation: Build a native SwiftUI/UIKit file tree, using `@pierre/trees` as a UX and performance reference rather than a runtime dependency.**

- **Solves:** The repo/file tree needs path-first rendering, virtualized large lists, flatten-empty-directory mode, Git status decorations, multi-selection, search/filter, drag/drop, context menus, sticky folders, keyboard navigation, type-ahead, and accessibility semantics.
- **Maturity and maintenance:** `@pierre/trees` is an Apache-2.0 web file-tree renderer from the active `pierrecomputer/pierre` monorepo. Its docs show virtualization, ARIA tree semantics, Git status, drag/drop, search modes, icons, density settings, and theme integration. It was still beta (`1.0.0-beta.4`) when checked.
- **License:** Apache-2.0.
- **Fit for iPadOS:** Strong as a product/design reference; weak as a direct app dependency. It is JavaScript/TypeScript, uses Preact/React entry points, and renders through DOM/shadow roots rather than native iPad accessibility and list mechanics.
- **Alternatives:** Native SwiftUI `List`/`OutlineGroup` with custom virtualization if feasible; UIKit collection/table view with diffable data sources; custom native tree model backed by Swift Collections.
- **Risks:** Embedding the core file tree in `WKWebView` would fight native drag/drop, Files integration, keyboard focus, VoiceOver, pointer interactions, and theming. The package is beta, and a web component would increase dependency and App Store review surface.
- **Integration notes:** Borrow its feature checklist and semantics: path-keyed state, prepared input for large trees, Git descendant indicators, density modes, type-ahead, visible focus, and search behavior. Implement those natively behind a `FileTreeModel`/`FileTreeView` seam.

### 3.11 Diagrams, canvas, Pencil, and visual collaboration

**Recommendation: Use SwiftUI Canvas plus PencilKit for native annotation and lightweight diagrams.**

- **Solves:** Pencil annotations on screenshots, diffs, previews, whiteboard notes, simple nodes/edges, and markup workflows.
- **Maturity and maintenance:** Apple first-party. PencilKit is purpose-built for Apple Pencil input and system drawing behavior.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent.
- **Alternatives:** Excalidraw in a webview, custom Metal canvas, third-party graph canvas.
- **Risks:** Complex collaborative whiteboarding, auto-layout graphs, and infinite canvas features are non-trivial.
- **Integration notes:** Store strokes as PencilKit drawings plus our own semantic anchors to files, lines, screenshots, PR comments, or preview DOM snapshots. Keep canvas artifacts exportable as images/PDF and attachable to agent prompts.

**Recommendation: Use Mermaid for text-to-diagram rendering in a sandboxed webview.**

- **Solves:** Flowcharts, sequence diagrams, entity diagrams, and architecture diagrams in Markdown/docs/agent plans.
- **Maturity and maintenance:** Very widely adopted MIT project with active maintenance and large community.
- **License:** MIT.
- **Fit for iPadOS:** Good when isolated in `WKWebView` with local bundled assets and strict content controls.
- **Alternatives:** Graphviz, PlantUML, native Swift diagram renderer, Excalidraw.
- **Risks:** JavaScript rendering and untrusted diagram text must be sandboxed. Mermaid is not a native editing canvas.
- **Integration notes:** Bundle a pinned Mermaid version, render offline where possible, disable network access for diagram webviews, sanitize input, and export SVG/PNG snapshots for PR comments.

**Non-default alternative: Excalidraw.**

- **Solves:** Rich hand-drawn whiteboard UX and diagramming.
- **Maturity and maintenance:** Extremely popular MIT project with active development.
- **License:** MIT.
- **Fit for iPadOS:** Usable through a webview, but not native and heavy for core workspace canvas.
- **Alternatives:** PencilKit/SwiftUI Canvas, Mermaid.
- **Risks:** Web app inside native app increases integration, accessibility, storage, and App Review review surface.
- **Integration notes:** Consider only as optional import/export or an embedded advanced whiteboard after native annotation workflows are proven.

### 3.12 Previews, artifacts, and web views

**Recommendation: Use `WKWebView`, `SFSafariViewController`, QuickLook, PDFKit, and native media frameworks for preview surfaces.**

- **Solves:** Remote web previews, deployment links, GitHub/provider pages, HTML artifacts, PDFs, images, videos, logs, test reports, and generated documents.
- **Maturity and maintenance:** Apple first-party.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent if the app is clear that project code executes remotely and previews come from provider/deployment URLs.
- **Alternatives:** Custom preview proxy/backend, embedded browser shell for the whole app, third-party browser engines.
- **Risks:** App Store concerns if the app appears to execute downloaded code locally or proxy arbitrary app functionality. Web content security, cookies, auth, and file downloads need strict boundaries.
- **Integration notes:** Use `SFSafariViewController` for untrusted/login/provider surfaces, `WKWebView` for owned preview panels with navigation policies, and QuickLook/PDFKit for artifacts. Keep Safari handoff available for arbitrary generated app previews.

### 3.13 Design system, state management, and app architecture

**Recommendation: Build the design system on SwiftUI, SF Symbols, Human Interface Guidelines, and focused UIKit components.**

- **Solves:** Native controls, adaptive layout, dark/high-contrast modes, keyboard shortcuts, menus, pointer states, sheets, inspectors, and consistent app polish.
- **Maturity and maintenance:** Apple first-party.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent.
- **Alternatives:** Cross-platform design systems, web component libraries, custom UI everywhere.
- **Risks:** SwiftUI-only controls may not reach pro density/performance in editor/diff/workspace lists.
- **Integration notes:** Define tokens for color, typography, spacing, iconography, hunk colors, risk tiers, and provider statuses. Use native controls until measured gaps require custom drawing.

**Recommendation: Evaluate The Composable Architecture (TCA) for complex workspace/agent state, but do not adopt blindly.**

- **Solves:** Predictable feature composition, reducer-based state transitions, effect cancellation, testability, navigation, and modular app architecture.
- **Maturity and maintenance:** Point-Free's TCA is a highly active MIT package with large Swift community adoption.
- **License:** MIT.
- **Fit for iPadOS:** Good for a complex SwiftUI app with many concurrent agent/provider states.
- **Alternatives:** Plain Observable models with actors/services, Redux-like in-house architecture, SwiftData-bound view models.
- **Risks:** Learning curve and framework gravity. Over-abstracting early can slow prototyping.
- **Integration notes:** Pilot TCA in agent board/workspace state where concurrency, cancellation, and tests matter. Keep provider clients and persistence independent so TCA can be removed if needed.

### 3.14 Accessibility, quality, and testing

**Recommendation: Use XCTest/XCUITest, Swift Testing, Accessibility APIs, and CI as the base.**

- **Solves:** Unit tests, UI tests, keyboard navigation tests, accessibility labels/actions, dynamic type checks, and regression coverage.
- **Maturity and maintenance:** Apple first-party plus `swift-testing` Apache-2.0 and actively maintained by Swift.
- **License:** Apple SDK and Apache-2.0 for swift-testing.
- **Fit for iPadOS:** Excellent.
- **Alternatives:** Quick/Nimble, ViewInspector, SnapshotTesting.
- **Risks:** UI tests can be flaky; editor and terminal surfaces need custom accessibility strategies.
- **Integration notes:** Create benchmark/test fixtures for large files, large diffs, streaming logs, VoiceOver line/hunk navigation, keyboard shortcuts, and app restore after termination.

**Recommendation: Add SnapshotTesting, ViewInspector, and Nimble selectively.**

- **Solves:** Pixel/snapshot regression, SwiftUI view inspection, expressive assertions, and complex state verification.
- **Maturity and maintenance:** SnapshotTesting is active MIT; ViewInspector is MIT and active; Nimble is Apache-2.0 and active.
- **License:** MIT for SnapshotTesting/ViewInspector; Apache-2.0 for Nimble.
- **Fit for iPadOS:** Good for CI and app modules. Snapshot baselines need device/OS discipline.
- **Alternatives:** Native XCTest assertions and screenshots only.
- **Risks:** Snapshot tests can be brittle across OS versions, fonts, and dark/high-contrast modes.
- **Integration notes:** Use snapshots for stable components: diff hunks, markdown blocks, approval sheets, terminal color output, and empty/error states. Do not snapshot constantly changing web previews.

**Recommendation: Use SwiftLint and swift-format in development/CI, not runtime.**

- **Solves:** Style consistency, safety lint rules, and formatted Swift source.
- **Maturity and maintenance:** SwiftLint is popular MIT and active; swift-format is Apache-2.0 and maintained in the Swift ecosystem.
- **License:** MIT/Apache-2.0.
- **Fit for iPadOS:** Build-time only, no app runtime impact.
- **Alternatives:** Xcode defaults only, custom scripts.
- **Risks:** Overly strict rules can slow development. Tool versions must be pinned in CI.
- **Integration notes:** Pin exact versions, publish lint baselines only if needed, and avoid introducing lint tools as app dependencies.

### 3.15 Telemetry, diagnostics, and crash reporting

**Recommendation: Use OSLog and MetricKit by default.**

- **Solves:** Structured client logs, signposts, performance diagnostics, crash diagnostics, hangs, power, memory, and per-device reports.
- **Maturity and maintenance:** Apple first-party. MetricKit specifically aggregates exception/crash diagnostics and power/performance metrics.
- **License:** Apple platform SDK.
- **Fit for iPadOS:** Excellent and privacy-preserving.
- **Alternatives:** Sentry, Firebase Crashlytics, Bugsnag, custom telemetry backend.
- **Risks:** MetricKit delivery is delayed/aggregated and not a full product analytics system. OSLog privacy annotations must be correct.
- **Integration notes:** Define privacy-safe log categories: auth, provider, GitHub API, editor, diff, terminal, persistence, sync, crash. Redact prompts, code, tokens, secrets, file paths where required.

**Recommendation: Add Sentry Cocoa if real-time crash/session visibility is needed.**

- **Solves:** Crash reporting, release health, performance traces, breadcrumbs, and issue grouping across app versions.
- **Maturity and maintenance:** Official Sentry SDK for iOS/iPadOS/macOS, MIT, active.
- **License:** MIT for SDK; Sentry service terms for hosted backend.
- **Fit for iPadOS:** Good, with privacy configuration and consent controls.
- **Alternatives:** Firebase Crashlytics, Bugsnag, self-hosted Sentry, MetricKit-only.
- **Risks:** Private code/prompts/logs must not leak in breadcrumbs or attachments. Third-party SDK privacy manifest and data-use disclosures must be audited.
- **Integration notes:** Disable automatic PII capture where possible, scrub breadcrumbs, sample performance traces, allow enterprise opt-out, and route all telemetry through a `TelemetrySink` abstraction.

### 3.16 Agent skills, repo instructions, and reusable workflows

**Recommendation: Support agent instructions/skills as versioned content, not as installed executable extensions in V1.**

- **Solves:** Reusable agent workflows, project conventions, review checklists, build/test instructions, provider-specific guidance, and user/team playbooks without hardcoding every workflow in the app.
- **Maturity and maintenance:** Public signals are strong but fragmented. OpenAI Codex documents `AGENTS.md` discovery and layering. GitHub Copilot coding agent supports root and nested `AGENTS.md` alongside `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `CLAUDE.md`, and `GEMINI.md`. OpenCode documents `SKILL.md` folder discovery, metadata, and permissions. Anthropic's public `anthropics/skills` repo describes skills as folders with `SKILL.md`, scripts, and resources; it includes both Apache-2.0 open-source examples and source-available document skills.
- **License:** Varies by skill/instruction repository. Anthropic examples include Apache-2.0 and source-available content. OpenCode skill definitions include optional license metadata. Repo-local instructions inherit the repository's license/policy context.
- **Fit for iPadOS:** Good as read-only/imported guidance. The app can browse, validate, lint, compare, and attach skills/instructions to provider tasks without executing local scripts on iPad.
- **Alternatives:** Hardcoded agent recipes, MCP servers, provider marketplaces, custom backend-managed prompts.
- **Risks:** Skills may include scripts, copyrighted templates, secrets, or provider-specific assumptions. Installing/running skill scripts on iPad would conflict with the remote-execution posture. Formats are still evolving across providers.
- **Integration notes:** V1 should index `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `CLAUDE.md`, `GEMINI.md`, `.opencode/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`, and `.agents/skills/*/SKILL.md` as repository content. Show provenance, license, and provider compatibility. Let users include skills/instructions in context bundles or provider launches, but do not install skills or execute bundled scripts locally.

### 3.17 Package/dependency risk management

**Recommendation: Use Swift Package Manager with explicit pinning, license manifests, and dependency review gates.**

- **Solves:** Reproducible builds, legal review, supply-chain visibility, SDK privacy manifests, and App Store compliance.
- **Maturity and maintenance:** SPM is Apple's native dependency manager. Apple now requires attention to third-party SDK privacy manifests and signatures for listed SDKs.
- **License:** Tooling is part of the Swift/Xcode ecosystem; dependencies retain their own licenses.
- **Fit for iPadOS:** Excellent.
- **Alternatives:** CocoaPods, Carthage, vendored binary frameworks.
- **Risks:** Binary SDKs and C libraries can trigger privacy/signature obligations. Copyleft licenses can contaminate distribution. Transitive dependencies can add network, crypto, or tracking behavior.
- **Integration notes:** Maintain `DEPENDENCIES.md` or generated license inventory later when the app project exists. For every dependency track: package URL, pinned version, license, source availability, privacy manifest, binary/static/dynamic status, supported platforms, App Store notes, and replacement plan. Require legal approval for GPL, LGPL, AGPL, SSPL, custom commercial terms, and telemetry SDKs.

**High-risk dependency classes to avoid by default:**

- GPL/commercial-only UI libraries unless explicitly purchased and approved.
- SDKs on Apple's privacy-manifest/signature list unless the value clearly outweighs disclosure/review cost.
- JavaScript bundles that fetch remote code for core UI.
- Native libraries requiring OpenSSL/BoringSSL/libssh2 unless the feature is central and audited.
- Abandoned wrappers around security, Git, or OAuth primitives.
- Provider SDKs that collect analytics or hide auth/token behavior.

## 4. V1 dependency shortlist

| Package/framework | Use in V1 | License | Decision |
| --- | --- | --- | --- |
| SwiftUI/UIKit/TextKit 2 | App shell, pro editor/diff surfaces | Apple SDK | Adopt |
| Runestone | Initial code editor | MIT | Adopt with adapter/fork plan |
| Tree-sitter | Parsing/highlighting | MIT core; grammar-specific | Adopt curated grammar set |
| libgit2 | Local Git subset | GPLv2 with linking exception | Evaluate with legal review |
| SwiftGit2 | Swift wrapper for libgit2 | MIT | Evaluate, do not depend blindly |
| swift-markdown | Markdown AST | Apache-2.0 | Adopt |
| MarkdownUI | SwiftUI Markdown rendering | MIT | Optional/prototyping; watch maintenance mode |
| GRDB | SQLite/cache/FTS | MIT | Adopt |
| SwiftNIO SSH | SSH building blocks | Apache-2.0 | Adopt/evaluate for runtime adapter |
| SwiftTerm | Terminal emulator | MIT | Adopt for remote terminals/logs |
| Swift OpenAPI Generator | Typed REST clients | Apache-2.0 | Use selectively |
| Apollo iOS | GraphQL client | MIT | Add if GraphQL grows |
| AppAuth-iOS | Complex OAuth/OIDC | Apache-2.0 | Optional |
| Valet | Keychain wrapper | Apache-2.0 | Optional |
| TCA | Complex app state | MIT | Pilot, not mandatory |
| SnapshotTesting/ViewInspector/Nimble | Tests | MIT/MIT/Apache-2.0 | Adopt selectively |
| Sentry Cocoa | Crash/performance | MIT SDK | Optional with privacy review |
| Mermaid | Diagrams | MIT | Adopt in sandboxed preview |
| Excalidraw | Whiteboard | MIT | Defer/optional web import |
| STTextView | TextKit 2 editor alternative | GPLv3/commercial | Avoid unless commercial license approved |
| `@pierre/diffs` / PierreDiffsSwift | Diff rendering inspiration/prototype | Apache-2.0 / MIT | Reference/evaluate; do not make core iPad renderer yet |
| `@pierre/trees` | File tree UX/performance reference | Apache-2.0 | Reference only; build native file tree |

## 5. Repo-local agent skills installed

These skills are installed project-locally in `.agents/skills/` and pinned in `skills-lock.json`. They are for the engineering agents working on this repository, not runtime extensions that the iPad app executes. They were selected because they are directly relevant to the product's quality bar and have strong fit or publisher reputation.

| Skill | Source | Why included | Notes |
| --- | --- | --- | --- |
| `swiftui-pro` | `twostraws/swiftui-agent-skill` | SwiftUI correctness, performance, accessibility, navigation, and modern API review from a highly regarded Swift educator. | Use when implementing SwiftUI app shell, settings, workspace chrome, and component reviews. |
| `swift-testing-pro` | `twostraws/swift-testing-agent-skill` | Modern Swift Testing guidance for unit/integration tests and XCTest migration boundaries. | Use for app logic tests; UI tests still rely on XCTest/XCUITest. |
| `ios-accessibility` | `dpearson2699/swift-ios-skills` | Detailed SwiftUI/UIKit accessibility guidance for VoiceOver, Dynamic Type, keyboard access, custom rotors, and testing. | High fit because accessibility is part of the Apple Design Award-level bar. |
| `app-store-review` | `dpearson2699/swift-ios-skills` | App Store review, privacy manifest, ATT, entitlement, metadata, and HIG compliance preparation. | High fit because the app intentionally avoids arbitrary iPad-local code execution and must explain remote execution clearly. |
| `mobile-ios-design` | `wshobson/agents` | iOS/iPad design patterns, HIG concepts, adaptive layouts, SF Symbols, and SwiftUI components. | Use during design reviews and UI implementation; validate against official HIG when decisions are critical. |
| `documentation-and-adrs` | `addyosmani/agent-skills` | Decision records and durable documentation for architectural choices. | Use when choosing libraries, auth/runtime architecture, and irreversible design-system decisions. |
| `improve-codebase-architecture` | `mattpocock/skills` | Architecture deepening, interface seams, adapter quality, and maintainability review. | Use once implementation starts, especially around provider adapters, editor engine, GitHub clients, and runtime abstractions. |

Rejected/withheld categories:

- Generic UX/design skills with unclear provenance or shallow guidance.
- Unmaintained Swift/iOS skills that duplicate better sources above.
- Broad code-review skills not specific to Swift/iPadOS, architecture, or product documentation.
- Any skill that would encourage local execution of untrusted project code inside the iPad app.

## 6. Source notes

Source notes include official docs and repository metadata checked during this research. GitHub repository maturity signals such as stars, license, and recent push dates were checked through public GitHub metadata on 2026-05-22.

| Topic | Source |
| --- | --- |
| Product context | `README.md`, `docs/PRD.md` |
| SwiftUI | https://developer.apple.com/documentation/swiftui |
| UIKit | https://developer.apple.com/documentation/uikit |
| TextKit 2 sample | https://developer.apple.com/documentation/uikit/using-textkit-2-to-interact-with-text |
| AuthenticationServices | https://developer.apple.com/documentation/authenticationservices |
| Keychain Services | https://developer.apple.com/documentation/security/keychain-services |
| FileProvider | https://developer.apple.com/documentation/fileprovider |
| WebKit / WKWebView | https://developer.apple.com/documentation/webkit/wkwebview |
| SFSafariViewController | https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller |
| PencilKit | https://developer.apple.com/documentation/pencilkit |
| QuickLook | https://developer.apple.com/documentation/quicklook |
| PDFKit | https://developer.apple.com/documentation/pdfkit |
| OSLog | https://developer.apple.com/documentation/os/logging |
| MetricKit | https://developer.apple.com/documentation/metrickit |
| XCTest | https://developer.apple.com/documentation/xctest |
| App Store software requirements | https://developer.apple.com/app-store/review/guidelines/#software-requirements |
| Apple third-party SDK privacy/signature requirements | https://developer.apple.com/support/third-party-SDK-requirements/ |
| Apple privacy manifest files | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files |
| Runestone | https://github.com/simonbs/Runestone |
| Runestone docs | https://docs.runestone.app |
| Tree-sitter | https://github.com/tree-sitter/tree-sitter |
| Tree-sitter docs | https://tree-sitter.github.io/tree-sitter/ |
| TreeSitterLanguages Swift packages | https://github.com/simonbs/TreeSitterLanguages |
| STTextView license | https://github.com/krzyzanowskim/STTextView/blob/main/LICENSE.md |
| GitHub REST API | https://docs.github.com/en/rest |
| GitHub GraphQL API | https://docs.github.com/en/graphql |
| GitHub Search API and rate limits | https://docs.github.com/en/rest/search/search |
| libgit2 | https://github.com/libgit2/libgit2 |
| libgit2 license | https://github.com/libgit2/libgit2/blob/main/COPYING |
| SwiftGit2 | https://github.com/SwiftGit2/SwiftGit2 |
| swift-markdown | https://github.com/swiftlang/swift-markdown |
| MarkdownUI | https://github.com/gonzalezreal/swift-markdown-ui |
| GRDB | https://github.com/groue/GRDB.swift |
| SwiftNIO | https://github.com/apple/swift-nio |
| SwiftNIO SSH | https://github.com/apple/swift-nio-ssh |
| SwiftTerm | https://github.com/migueldeicaza/SwiftTerm |
| Swift OpenAPI Generator | https://github.com/apple/swift-openapi-generator |
| Swift OpenAPI URLSession | https://github.com/apple/swift-openapi-urlsession |
| Apollo iOS | https://github.com/apollographql/apollo-ios |
| AppAuth-iOS | https://github.com/openid/AppAuth-iOS |
| Valet | https://github.com/square/Valet |
| KeychainAccess | https://github.com/kishikawakatsumi/KeychainAccess |
| Swift Collections | https://github.com/apple/swift-collections |
| Swift Algorithms | https://github.com/apple/swift-algorithms |
| Swift Async Algorithms | https://github.com/apple/swift-async-algorithms |
| Swift Crypto | https://github.com/apple/swift-crypto |
| Swift Log | https://github.com/apple/swift-log |
| Swift Metrics | https://github.com/apple/swift-metrics |
| The Composable Architecture | https://github.com/pointfreeco/swift-composable-architecture |
| SnapshotTesting | https://github.com/pointfreeco/swift-snapshot-testing |
| ViewInspector | https://github.com/nalexn/ViewInspector |
| Nimble | https://github.com/Quick/Nimble |
| Swift Testing | https://github.com/swiftlang/swift-testing |
| SwiftLint | https://github.com/realm/SwiftLint |
| swift-format | https://github.com/swiftlang/swift-format |
| Sentry Cocoa | https://github.com/getsentry/sentry-cocoa |
| Mermaid | https://github.com/mermaid-js/mermaid |
| Mermaid docs | https://mermaid.js.org |
| Excalidraw | https://github.com/excalidraw/excalidraw |
| Pierre monorepo | https://github.com/pierrecomputer/pierre |
| `@pierre/diffs` docs | https://diffs.com |
| `@pierre/diffs` source | https://github.com/pierrecomputer/pierre/tree/main/packages/diffs |
| PierreDiffsSwift | https://github.com/jamesrochabrun/PierreDiffsSwift |
| `@pierre/trees` docs | https://trees.software |
| `@pierre/trees` source | https://github.com/pierrecomputer/pierre/tree/main/packages/trees |
| OpenAI Codex AGENTS.md | https://developers.openai.com/codex/guides/agents-md |
| GitHub Copilot custom instructions | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions |
| GitHub Copilot AGENTS.md changelog | https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/ |
| OpenCode skills | https://opencode.ai/docs/skills/ |
| Anthropic skills repository | https://github.com/anthropics/skills |
| SwiftUI Pro skill | https://skills.sh/twostraws/swiftui-agent-skill/swiftui-pro |
| Swift Testing Pro skill | https://skills.sh/twostraws/swift-testing-agent-skill/swift-testing-pro |
| iOS Accessibility skill | https://skills.sh/dpearson2699/swift-ios-skills/ios-accessibility |
| App Store Review skill | https://skills.sh/dpearson2699/swift-ios-skills/app-store-review |
| Mobile iOS Design skill | https://skills.sh/wshobson/agents/mobile-ios-design |
| Documentation and ADRs skill | https://skills.sh/addyosmani/agent-skills/documentation-and-adrs |
| Improve Codebase Architecture skill | https://skills.sh/mattpocock/skills/improve-codebase-architecture |
