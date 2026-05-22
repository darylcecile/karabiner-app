# ADR-004: Adopt an App Store-safe security and privacy posture

## Status
Accepted

## Date
2026-05-22

## Context
Karabiner handles source code, repository metadata, agent prompts, logs, credentials, and potentially sensitive organizational data. The PRDs require professional trust, explicit approval gates, provider honesty, and App Store compliance. The app must use public APIs, avoid dynamic code execution that changes host app functionality, and document privacy behavior accurately.

## Decision
Use the following baseline posture for the initial implementation:

- Authenticate with GitHub and supported providers through system web authentication flows with OAuth PKCE where applicable.
- Store tokens and sensitive credentials in Keychain, not plain files, user defaults, logs, transcripts, or committed fixtures.
- Request least-privilege scopes and make repo/provider permissions visible before starting agent work.
- Ship and maintain `PrivacyInfo.xcprivacy` for any required reason APIs and third-party SDK disclosures used by the app.
- Make no tracking claims unless tracking is intentionally added and fully disclosed. The initial product direction is no cross-app tracking.
- Use public Apple APIs only.
- Keep arbitrary code execution remote or user-owned, and include App Review notes explaining runtime boundaries, provider handoffs, and why the iPad app is a control plane.
- Redact secrets from prompts, logs, diffs, diagnostics, and crash/telemetry payloads by default.

## Alternatives Considered

### Embedded web login or password capture
- Pros: Can appear simpler for custom providers.
- Cons: Weak security, poor user trust, and likely provider/App Store policy issues.
- Rejected in favor of system authentication surfaces and provider-approved auth.

### Broad, long-lived tokens
- Pros: Fewer auth refresh paths to implement.
- Cons: Increases blast radius and enterprise review risk.
- Rejected in favor of least privilege, rotation/revocation support, and Keychain storage.

### Analytics-first instrumentation
- Pros: More product usage data.
- Cons: Higher privacy disclosure burden and risk of leaking source or prompt content.
- Rejected for the foundation; use privacy-preserving diagnostics first.

## Consequences
- Security and privacy requirements must be reviewed with every provider, SDK, and required-reason API addition.
- App Store submission needs clear notes describing remote execution and provider authentication.
- Logs and diagnostics may be less detailed when redaction is required, so support tooling must handle redacted evidence.
- Adding telemetry, new SDKs, or local runtime features may require privacy manifest and App Review note updates.
