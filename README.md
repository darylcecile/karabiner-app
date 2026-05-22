# iPad Agentic IDE

This repository has been reset for a new iPad-first agentic IDE that lets a developer authenticate with GitHub and optional agent providers, use existing AI subscriptions where officially supported, and build software from a native iPad experience.

The recommended product direction is a native Swift iPad app that uses GitHub as the default execution/control plane first: Copilot cloud agent tasks, Issues, Pull Requests, Actions, Checks, and optional Codespaces/deep links where GitHub exposes them. It should also support provider-specific cloud/remote agents such as Claude Code, Codex, and OpenCode when users authenticate with those services. A dedicated backend should be deferred until we need capabilities the provider APIs or user-owned runtimes do not provide. The full product requirements document is in [`docs/PRD.md`](docs/PRD.md).

## Recommended stack

- **iPad app:** Swift 6, SwiftUI app shell, UIKit/TextKit 2 editor surfaces, AuthenticationServices, Keychain, FileProvider, SQLite/GRDB for local caches.
- **Code editor:** Runestone/Tree-sitter as the starting point, with a fork or custom TextKit 2 editor if required by performance or collaboration needs.
- **Agent execution:** GitHub Copilot cloud agent Agent Tasks REST API first; Copilot SDK/custom backend only if GitHub APIs cannot support the required UX.
- **Additional providers:** Claude Code on the web/Remote Control, OpenAI Codex cloud/CLI/IDE, and OpenCode GitHub Action or remote server adapters.
- **Execution model:** Provider-hosted agents, GitHub-hosted agent environments, Issues/PRs, Actions, Checks, Codespaces, and user-owned local dev runtimes where available; the iPad app is the native control plane and editor.
- **GitHub integration:** User-to-server OAuth tokens, GitHub REST/GraphQL APIs, Copilot cloud agent tasks, pull requests, issues, checks, and usage visibility.
- **Subscription policy:** Use existing Copilot, Claude, Codex/ChatGPT, OpenCode/provider, or API-key access only through official auth paths; do not route subscriptions through unsupported providers.
- **Local dev mode:** Optional user-owned compute via Mac/Linux/Windows companion, SSH, Codespaces, or OpenCode/Codex/Claude remote-control sessions. Do not execute arbitrary project code inside the iPad app.

## Current repo contents

- `docs/PRD.md` - researched PRD, competitor analysis, stack recommendation, architecture, V1 requirements, risks, and source links.
- `docs/PRD-design.md` - design and UX PRD covering visual identity, design language, competitor design analysis, iPad interactions, accessibility, and Apple Design Award-level quality goals.
- `docs/PRD-libraries.md` - library/framework research and dependency recommendations for the Swift/iPad app, plus selected project agent skills.
- `project.yml` - XcodeGen project definition for the Swift 6 iPadOS app, framework, unit test, and UI test targets.
- `KarabinerApp/`, `KarabinerCore/`, `KarabinerUI/`, `KarabinerTests/`, and `KarabinerUITests/` - initial scaffold sources and resources.
- `.agents/skills/` and `skills-lock.json` - vetted repo-local agent skills for SwiftUI, Swift Testing, iOS design, accessibility, App Store review, architecture, and documentation.
- `.gitignore` - Swift/Xcode/iPad project ignores.

## Project scaffold

The app scaffold is declared in `project.yml` for XcodeGen. Generate the Xcode project with:

```sh
xcodegen generate --spec project.yml
```

The initial target graph is:

- `Karabiner` — iPadOS SwiftUI app target.
- `KarabinerCore` — framework target reserved for core app logic.
- `KarabinerUI` — framework target containing the SwiftUI shell entry view.
- `KarabinerTests` — Swift Testing unit test target.
- `KarabinerUITests` — XCTest UI test target.

The scaffold targets iPadOS 26.1 because this is a new iPad-only app and Xcode 26 defaults new projects to the current iPadOS generation; 26.1 is the earliest iPadOS 26 simulator runtime available in the validated toolchain.

The runtime UI does not use mocked repositories, agents, approvals, checks, or logs. Empty screens stay empty until GitHub credentials are stored in Keychain and real GitHub REST API data is loaded.
