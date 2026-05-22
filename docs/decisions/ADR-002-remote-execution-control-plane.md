# ADR-002: Keep the iPad app as a remote execution control plane

## Status
Accepted

## Date
2026-05-22

## Context
The PRDs position Karabiner as a native iPad cockpit for professional agentic development, not as a replacement for macOS, Linux, CI, provider clouds, or user-owned development machines. iPadOS sandboxing and App Store review expectations make arbitrary project builds, package managers, shells, and agent tool loops inside the host app a poor V1 foundation.

App Store posture also requires public APIs only and prohibits downloaded or interpreted code from changing the host app's functionality. A trustworthy product must make runtime location, permissions, logs, costs, and review gates explicit.

## Decision
Do not execute arbitrary user project code inside the iPad app. The app is the native control plane, editor/review surface, cache, and approval cockpit. Builds, tests, package installs, migrations, previews, and agent tool execution run only in:

- GitHub-hosted surfaces such as Copilot cloud agent tasks, Actions, Checks, PRs, Issues, and Codespaces/deep links where available.
- Provider-hosted surfaces such as Claude Code, Codex, or other official provider runtimes.
- Explicitly trusted user-owned runtimes such as a Mac, Linux/Windows host, SSH target, companion service, or self-hosted OpenCode server.

Every runtime must be labeled before launch, and destructive operations remain behind user-visible approval gates.

## Alternatives Considered

### Embedded local terminal/build environment on iPad
- Pros: Feels self-contained and can work offline for small projects.
- Cons: High App Store, security, sandboxing, package execution, and support risk.
- Rejected for arbitrary project execution in V1.

### In-app VM or container runtime
- Pros: Stronger isolation than running directly in the app process.
- Cons: Entitlement, distribution, performance, storage, and review risks are not a stable V1 dependency.
- Rejected unless Apple provides a clear App Store-safe path later.

### Custom backend as the default runtime
- Pros: Full control over logs, streaming, preview, and workspace lifecycle.
- Cons: Adds security, compliance, cost, secrets, and operations burden before provider APIs are exhausted.
- Deferred until provider-hosted or user-owned execution cannot satisfy a required workflow.

## Consequences
- The app can remain App Store-aligned while still controlling serious development work.
- Runtime-specific limitations must be surfaced honestly instead of hidden behind a fake terminal abstraction.
- Offline support focuses on cached files, drafts, review, and context preparation rather than local builds.
- Review notes should explain that code execution happens in provider-hosted or user-owned environments, not through dynamic iPad-local execution.
