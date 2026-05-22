# ADR-003: Use GitHub-native workflows with honest provider adapters

## Status
Accepted

## Date
2026-05-22

## Context
The PRDs make GitHub the default source of truth for repositories, issues, pull requests, checks, Actions, and agent-produced changes. Current research confirms the Copilot Agent Tasks REST API is public preview for Copilot Business/Enterprise, supports user-to-server tokens, and does not yet support server-to-server installation tokens or Pro/Pro+ API access. Pro/Pro+ and installation-token support should be treated as future capability, not as a V1 guarantee.

The product also needs optional support for Claude, Codex, OpenCode, Codespaces, and user-owned runtimes without pretending they have identical APIs, billing, logging, or execution models.

## Decision
Use a GitHub-native architecture first, with provider adapters around it:

- GitHub REST/GraphQL APIs, Issues, PRs, Checks, Actions, branches, commits, and deep links are the default workflow backbone.
- Copilot cloud agent tasks are the preferred GitHub agent path when the authenticated account and organization support the public-preview API.
- When an API is unavailable, use honest fallbacks: deep links, provider web handoff, Issues/PR comments, Actions workflows, or user-owned runtime adapters.
- Each provider adapter must declare capabilities and limits, including auth type, execution location, task lifecycle, streaming/log support, repository write path, budget visibility, and PR behavior.
- Avoid routing subscriptions through unsupported providers or implying unavailable entitlement support.

## Alternatives Considered

### Single-provider implementation
- Pros: Smaller V1 surface area.
- Cons: Locks product direction to one provider's API gaps and subscription model.
- Rejected because the PRDs require GitHub-native default behavior plus optional provider choice.

### Fully normalized provider abstraction
- Pros: Simple UI and service contracts.
- Cons: Hides important differences in auth, billing, logs, streaming, lifecycle, and review controls.
- Rejected in favor of a common task envelope plus explicit provider capability metadata.

### Custom agent backend first
- Pros: Unified lifecycle, streaming, and tools independent of providers.
- Cons: Adds major security, compliance, secrets, cost, and App Store review complexity.
- Deferred until official provider APIs and deep-link workflows cannot support required product behavior.

## Consequences
- The app can be useful with GitHub-native state even when provider task APIs are limited.
- UI and docs must clearly label provider, runtime, account, billing path, and unsupported capabilities.
- Service code should be designed for fallbacks and deep links rather than assuming all users can start Copilot Agent Tasks by API.
- Future Pro/Pro+ or server-to-server support can be added without changing the core GitHub-native workflow model.
