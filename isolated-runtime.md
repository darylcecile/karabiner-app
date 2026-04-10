# Isolated Runtime Design

## Summary

Karabiner extensions run in an isolated extension host using QuickJS contexts, while all privileged operations are enforced by the Bun main process through a host bridge. Extension authors write TypeScript, and Karabiner compiles the extension on the user machine after the user approves requested permissions.

This gives us:

- TypeScript-first authoring for extension developers
- A lightweight runtime that can support tens of installed extensions
- Strong capability controls for filesystem, network, CLI, and AI access
- A single policy enforcement layer in Bun

## Goals

1. Keep extension authoring simple and TypeScript-first.
2. Prevent direct privileged access from extension code.
3. Enforce permissions centrally and consistently.
4. Keep runtime overhead low enough for many installed extensions.
5. Make failures and denials explicit and auditable.

## Non-goals

- Running raw untrusted JavaScript with no host validation.
- Allowing extensions to bypass host policy through runtime globals.
- Maintaining a permanently active worker for every installed extension.

## Threat model and assumptions

1. Extensions may be buggy or malicious.
2. The extension runtime must not have ambient host authority.
3. Privileged actions are only legal through explicit, permission-gated host calls.
4. Defense-in-depth is required: runtime isolation plus strict broker enforcement.

## Runtime architecture

## Core processes

1. **Bun main process (authority)**
   - Owns extension install state, permission grants, and policy enforcement.
   - Executes all privileged operations.
   - Maintains audit logs and denial logs.
2. **Extension host worker pool (execution)**
   - A small fixed pool (for example, 1 to 3 workers), not one worker per extension.
   - Each worker hosts multiple extension runtimes.
3. **QuickJS runtime/context per active extension**
   - One isolated context per extension instance.
   - No direct access to Bun/Node APIs.
   - Receives only the API surface we explicitly expose.

## Bridge model

Extensions get a typed, ergonomic runtime context rather than a raw RPC primitive.

Developer-facing examples:

- `await ctx.fs.readFile(path): Promise<string>`
- `await ctx.network.fetch(url, init): Promise<NetworkResponse>`
- `await ctx.cli.exec(command, args): Promise<CliResult>`
- `await ctx.ai.chat(input): Promise<{ text: string }>`

Internally, the SDK can wrap these methods and forward them through a low-level bridge primitive, but extension authors only work with `ctx.*` methods.

Every privileged request still goes through the Bun broker. The extension runtime never receives direct `fs`, `fetch`, `process`, or shell primitives.

## TypeScript authoring and install-time compilation

## Authoring contract

1. Extension authors write TypeScript against `@karabiner/sdk`.
2. Manifest `entrypoint` can target TypeScript source (for example `src/index.ts`).
3. Distributed extension bundles contain source and metadata needed for local build.

## Install flow with compile step

1. Download extension package.
2. Validate manifest schema and static permission declarations.
3. Present permission prompt and collect explicit user decision.
4. If approved, compile TypeScript on the client machine using Karabiner-owned build settings.
5. Persist compiled artifacts and activation metadata.
6. Activate extension through isolated runtime.

Compilation happens only after permission approval, so the activated artifact is exactly what the user approved and installed on that machine.

## Compiler policy

1. Karabiner controls compiler flags (not extension-provided build scripts).
2. No lifecycle scripts or arbitrary package-manager execution during install.
3. Build output is deterministic and hashed for auditability.
4. Runtime loads compiled JS only.

Recommended output:

- `runtime/index.js`
- `runtime/index.js.map`
- `runtime/build-metadata.json` (compiler version, options, source hash, output hash)

## Capability model

Permissions remain static and manifest-declared. Runtime checks are dynamic and strict.

## Notes capabilities

- `notes.read`
- `notes.write`

## Filesystem capabilities

- `filesystem.read` with allowed `roots[]`
- `filesystem.write` with allowed `roots[]`

Enforcement rules:

1. Canonicalize path with realpath-style resolution.
2. Reject traversal and symlink escapes outside granted roots.
3. Enforce read/write mode separately.

## Network capability

- `network` with `allowlist[]`

Enforcement rules:

1. Parse URL and enforce allowed scheme/host/port.
2. Deny redirects to disallowed destinations.
3. Apply request and response size/time limits.

## AI provider capability

- `ai.provider` with `providerIds[]`

Enforcement rules:

1. Restrict provider/model usage to approved IDs.
2. Apply per-extension usage quotas and concurrency limits.

## CLI capability

- `cli.exec` with `commands[]`

Enforcement rules:

1. Require explicit command allowlist match.
2. Validate argument policy before execution.
3. Enforce timeout, output-size caps, and exit-code reporting.

## Lightweight scaling model

To support many installed extensions without high idle overhead:

1. Keep all extension metadata indexed, but activate runtimes lazily.
2. Use LRU idle eviction for QuickJS contexts.
3. Keep a small worker pool and schedule runtimes onto it.
4. Cap concurrent active extensions and host bridge calls.
5. Restart only the faulted extension runtime on crash.

This allows tens of installed extensions while keeping active memory and CPU bounded.

## Reliability and safety controls

1. Per-call timeout and cancellation.
2. Per-extension memory budget and execution budget.
3. Structured errors with extension ID, operation, and denial reason.
4. Circuit breaker for repeated runtime failures.
5. Explicit runtime state transitions: installed, approved, compiled, active, disabled, error.

## Observability and audit

Every privileged operation should emit structured logs:

1. Extension ID and version
2. Operation name
3. Permission used
4. Allow or deny decision
5. Denial reason or failure code
6. Duration and size metrics

This supports user-facing diagnostics and security review.

## Packaging and artifact layout

Example install directory:

`~/.karabiner/user/extensions/<extension-id>/<version>/`

Suggested contents:

1. `extension.json`
2. `source/` (original package contents)
3. `runtime/` (compiled JS artifacts)
4. `install.json` (approval record, compile metadata, hashes)

## Implementation plan (incremental)

## Phase 1: Runtime foundation

1. Add extension host worker pool.
2. Add QuickJS runtime manager per extension.
3. Add typed `ctx.*` capability APIs backed by an internal bridge protocol.

## Phase 2: Policy broker

1. Implement strict permission broker in Bun.
2. Route notes/network/filesystem through broker checks.
3. Add structured allow/deny logs.

## Phase 3: Install-time TypeScript pipeline

1. Compile after permission approval.
2. Persist runtime artifacts and hashes.
3. Activate from compiled JS only.

## Phase 4: Hardening and limits

1. Add quotas, concurrency caps, and LRU eviction.
2. Add failure isolation and auto-restart policy.
3. Add diagnostics and user-visible error surfaces.

## Future optional hardening

If threat requirements increase, add a stricter mode:

1. Run extension hosts in isolated sidecar processes.
2. Optionally execute high-risk extensions under a stronger OS sandbox profile.
3. Keep the same `ctx.*` SDK contract so API shape stays stable.

## Decision record

Chosen approach:

1. **QuickJS contexts for extension execution**
2. **Bun main process as the single policy authority**
3. **TypeScript source compiled locally after user approval**

Rationale:

- Preserves TypeScript developer experience
- Keeps runtime lightweight and scalable
- Provides enforceable capability boundaries with centralized policy
