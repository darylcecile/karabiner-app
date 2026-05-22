# ADR-005: Use Swift Testing, XCTest UI tests, and manual simulator accessibility validation

## Status
Accepted

## Date
2026-05-22

## Context
The initial repo scaffold includes separate unit and UI test areas. The PRDs require a native iPad app with secure provider integrations, reviewable agent workflows, accessibility, and App Store-quality polish. Because service, UI, and provider implementation work may still be in progress, this ADR defines the validation posture rather than asserting current coverage.

## Decision
Use a layered testing approach:

- Prefer Swift Testing for core unit tests, domain model behavior, provider adapter contracts, parsing, caching, and service/integration tests that can run without launching the UI.
- Use XCTest/XCUITest for app launch, navigation, authentication handoff seams that can be mocked, UI flows, keyboard/pointer critical paths, and regression checks that require the iPad app process.
- Keep real provider/network tests behind explicit configuration, use mocked fixtures by default, and avoid depending on public-preview API availability for routine CI.
- Validate accessibility manually in Simulator and on device where available: VoiceOver, Dynamic Type, Full Keyboard Access, reduced motion, color contrast, focus order, and diff/editor readability.
- Treat agent-device automation as an optional future enhancer only if it is installed and needed; it is not required for the foundation.

## Alternatives Considered

### XCTest for every test layer
- Pros: Single Apple test framework and mature UI support.
- Cons: Less expressive for fast, data-driven Swift unit tests.
- Rejected as the only framework, while keeping XCTest for UI.

### Snapshot-only UI validation
- Pros: Useful for visual regressions.
- Cons: Does not prove workflows, accessibility, keyboard behavior, or provider state handling.
- Rejected as the primary UI quality gate.

### Live-provider tests by default
- Pros: Exercises real GitHub/provider behavior.
- Cons: Flaky, credential-dependent, costly, and blocked by preview API availability.
- Rejected for routine CI; use contract tests and opt-in live validation instead.

## Consequences
- Core behavior can be validated quickly without launching the app.
- UI tests remain focused on high-value user journeys and platform integration.
- Accessibility is part of the release checklist, not a late optional pass.
- Provider adapters need deterministic fixture and mock seams from the start.
