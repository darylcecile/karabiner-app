# Product Requirements Document: Design and UX

Last updated: 2026-05-22

## 1. Research brief and product context

This document extends `docs/PRD.md` with a design and UX product requirements document for an iPad-first agentic IDE. The product is a native iPadOS cockpit for professional software work: GitHub repositories, agent sessions, code editing, diff review, checks, logs, previews, provider runtimes, and approvals. The iPad app is not expected to execute arbitrary project code locally. It should orchestrate provider-hosted and user-owned execution while making every agent action inspectable, reversible, and shippable through GitHub-native workflows.

The highest-order design problem is not "put VS Code on iPad." It is to make asynchronous, multi-provider AI engineering work feel trustworthy, controllable, and elegant on a touch-first pro device.

Design must optimize for:

- **Professional trust:** plans, tool calls, diffs, permissions, costs, checks, and merges are legible before irreversible actions happen.
- **iPad-native fluency:** touch, Apple Pencil, pointer, external keyboard, Stage Manager, Split View, drag and drop, Files, and fast resume feel first-class.
- **Apple Design Award-level craft:** intuitive interactions tailored to platform, inclusive access, visual coherence, technical polish, and meaningful innovation.
- **Provider clarity:** Copilot, Claude, Codex, OpenCode, Codespaces, GitHub Actions, and user-owned runtimes share a common UX envelope without hiding provider-specific limits.
- **High density without desktop clutter:** the app shows complex engineering state in layered, progressive surfaces rather than overloaded sidebars.

Non-goals for the design system:

- Do not imitate a desktop IDE chrome one-to-one.
- Do not make core UI a hidden webview shell.
- Do not obscure whether work runs in GitHub, a provider cloud, or a user's own runtime.
- Do not imply unsupported subscription routing or more billing precision than providers expose.
- Do not make agent magic more prominent than review, provenance, and recovery.

## 2. Design vision

**Vision:** a calm, powerful iPad-native command center where developers can create, steer, inspect, and ship software with agents from anywhere.

The product should feel like a blend of:

- the precision and direct manipulation of high-end iPad creative tools;
- the reliability and auditability of GitHub pull request workflows;
- the speed of a command palette and chat-driven agent;
- the polish of a first-party Apple productivity app.

The emotional target is **confident flow**:

1. The user always understands where they are: repo, branch, agent, runtime, task state.
2. The user always understands what changed: file, hunk, command, check, preview, PR.
3. The user always has a next move: approve, deny, edit, compare, request tests, open PR, merge, rollback, or hand off.
4. The app never makes serious engineering work feel like gambling.

The product should be beautiful, but beauty is not decoration. Beauty means the system reduces cognitive load, encodes risk visually, feels fast under the hands, adapts gracefully to iPad contexts, and turns agent uncertainty into reviewable engineering artifacts.

## 3. Design principles

| Principle | Product meaning | Design implications |
| --- | --- | --- |
| Native, not nostalgic | iPad is the primary platform, not a compromise surface for desktop IDE conventions. | Use `NavigationSplitView`, native toolbars, contextual menus, pointer hover, drag/drop, keyboard commands, system materials, and touch targets. Avoid tiny desktop controls and overloaded tree panes. |
| Reviewability over magic | Agent productivity matters only if users can understand and trust it. | Every agent session has plan, context, runtime, commands, changed files, diff, checks, costs, and provenance. "Done" never appears before reviewable evidence. |
| Progressive density | Developers need high information density, but only at the right depth. | Start with cards and summaries; drill into inspectors, popovers, diff hunks, raw logs, and transcripts. Make all summary data expandable to source evidence. |
| Human agency | Users choose when an agent can spend money, mutate code, touch secrets, deploy, or merge. | Permission sheets show action, rationale, files, domains, secrets, risk tier, cost/budget, and alternatives. Approvals are editable where possible. |
| Provider honesty | A normalized UX should not erase real provider differences. | Label provider, runtime, account, billing path, branch, lifecycle support, streaming support, and API limits on every session. |
| iPad input parity | Touch, Pencil, pointer, and keyboard are peers, not fallbacks. | Every primary action supports touch and a keyboard shortcut. Pencil adds annotation and context creation, not hidden mandatory features. Pointer hover reveals affordances without depending on hover. |
| Calm status | Agentic workflows are long-running and uncertain; status must reduce anxiety. | Use durable timelines, clear progress labels, optimistic but truthful loading states, notifications only for decisions/failures/completion, and visible recovery options. |
| Context is a material | The app's most important design object is selected context. | Files, symbols, screenshots, issues, logs, checks, previews, and prior agent turns become draggable context chips with visible scope and token/cost impact where available. |
| Inclusive by default | Accessibility is part of the pro quality bar. | VoiceOver, Dynamic Type for app chrome, full keyboard navigation, high contrast, reduced motion, color-independent status, localized strings, and readable diffs are launch requirements. |
| Recoverable by design | Multi-agent code work will fail, conflict, or surprise users. | Provide checkpoints, branch isolation, undo/revert, conflict UI, retry paths, archived transcripts, and visible source-of-truth links. |

## 4. Visual identity

### 4.1 Brand posture

Working codename: **Karabiner**. The metaphor is a secure connector: one native iPad surface linking GitHub, agents, runtimes, repositories, checks, previews, and people. The visual identity should communicate:

- **Secure connection:** strong linkage, gates, locks, branch graphs, traceable paths.
- **Agentic energy:** subtle luminous motion and status, not sci-fi noise.
- **Professional calm:** graphite, glass, paper, terminal ink, semantic color, generous whitespace.
- **iPad tactility:** rounded sheets, live cards, large hit areas, direct manipulation.

### 4.2 Palette direction

Use Apple semantic system colors as the foundation so the app respects light/dark mode, contrast, and accessibility. Add a restrained brand layer:

| Token | Role | Direction |
| --- | --- | --- |
| `Canvas` | Main editor/review background | Near-system background; avoid pure black/white in dense pro views. |
| `ElevatedSurface` | Cards, inspectors, approval sheets | System material with subtle border and shadow; separate status from content. |
| `AgentBlue` | Primary agent action, active session | Calm electric blue; never used for destructive state. |
| `ProviderViolet` | Multi-provider/fleet orchestration | Used sparingly for cross-agent comparison and provider switchers. |
| `GitGreen` | Passing checks, safe merge, additions | Semantic success; pair with labels/icons for color-blind access. |
| `ReviewAmber` | Needs attention, waiting approval, budget watch | Indicates a decision is needed, not failure. |
| `RiskRed` | destructive/critical approval, failing checks, secret warning | Reserved for criticality; never used decoratively. |
| `RuntimeTeal` | connected runtime, live preview, Codespace | Differentiates execution environment from agent identity. |
| `MutedInk` | secondary metadata | High contrast enough for long sessions; do not overuse low-opacity gray. |

### 4.3 Typography

- Use **SF Pro** for app UI. Lean on system text styles for adaptivity.
- Use **SF Mono** as the default mono option for code-adjacent UI, logs, commands, file paths, hashes, and line numbers.
- The editor supports user-selected coding fonts, but the product default should feel like Xcode/iPadOS: legible, balanced, and not visually gimmicky.
- Status labels use concise sentence case: "Running tests", "Needs approval", "Changes reviewable", "Runtime offline".
- Long agent text should use readable prose width in the transcript; code, diffs, and logs should use fixed-width, selectable surfaces.

### 4.4 Iconography and app icon

- Use **SF Symbols** for standard platform actions: search, branch, lock, check, warning, play, pause, terminal, cloud, sidebar, inspector.
- Create custom symbols only for product-specific concepts: agent session, fleet run, context bundle, runtime trust, provenance chain.
- App icon concept: a refined carabiner/branch-link shape with a subtle code bracket or commit-node negative space. It should read at small sizes, avoid generic AI sparkles, and work in dark/light icon variants.

### 4.5 Illustration and diagrams

- Onboarding and empty states can use restrained line illustrations: repo graph, agent path, iPad workspace, approval gate.
- Avoid "robot mascot" dependence. Agents are collaborators, not toys.
- Technical diagrams should use native-feeling cards and semantic chips; they should be useful to enterprise users, not marketing fluff.

### 4.6 Voice and microcopy

Voice: direct, calm, transparent, never anthropomorphic beyond "agent" as a product term.

Good:

- "Copilot wants to run tests in GitHub Actions."
- "This command can delete files. Review affected paths before approving."
- "Claude Remote Control is offline because your Mac is asleep."
- "Codex created a branch. Review 12 files and 3 checks."

Avoid:

- "Magic is happening."
- "Trust me."
- "The AI fixed everything."
- "Unlimited power" or billing-ambiguous copy.

## 5. Design language

### 5.1 Spatial structure

The app uses layered work surfaces:

1. **Global shell:** Home, Workspaces, Agents, Review Inbox, Create, Settings.
2. **Workspace shell:** repository sidebar, editor/review canvas, agent/check/runtime inspector.
3. **Focused task sheets:** approvals, command palette, context picker, provider picker, merge confirmation.
4. **Ephemeral overlays:** pointer hover previews, hunk actions, inline diagnostics, keyboard shortcut HUD.

This hierarchy creates depth without turning every screen into a three-column desktop IDE.

### 5.2 Materials and surfaces

- Use native materials for sidebars, inspectors, and floating palettes, but keep code/editor surfaces visually stable and low-glare.
- Cards are for objects with lifecycle: agent session, PR, check run, runtime, preview, approval, issue.
- Sheets are for decisions: auth, permission, destructive action, merge/deploy, provider connection.
- Popovers are for short-lived context: command details, line blame, symbol preview, cost explanation.

### 5.3 Component density

Use two density modes:

- **Comfortable:** default for onboarding, Home, Create, and touch-first review.
- **Pro dense:** optional workspace setting for editor, logs, file tree, and diff lists.

Dense mode may reduce vertical padding and metadata spacing, but it must not shrink hit targets below iPad-appropriate sizes for touch. Keyboard/pointer users can get denser tables; touch users get roomier interactive rows.

### 5.4 Status language

Agent and runtime status should use a consistent taxonomy:

- Draft
- Planning
- Waiting for approval
- Running
- Needs attention
- Reviewable
- Checks running
- Blocked
- Failed
- Merged
- Archived

Each state has:

- label;
- icon;
- color token;
- timestamp;
- source provider;
- next recommended action.

### 5.5 Syntax and review themes

Design syntax themes as first-class product assets:

- Light, dark, high contrast light, high contrast dark.
- Diff overlays that remain legible under syntax color.
- Agent provenance highlighting that does not fight additions/deletions.
- Inline comments and review threads that remain readable at small split-screen widths.
- Color-blind-safe additions/deletions through signs, borders, labels, and patterns, not only red/green.

## 6. Information architecture

### 6.1 Top-level map

| Area | Primary question it answers | Key objects |
| --- | --- | --- |
| Home | What needs my attention now? | Recent workspaces, active agents, approvals, failing checks, assigned issues, draft PRs. |
| Workspaces | Where am I building/reviewing? | Repo, branch, files, editor tabs, agent sessions, checks, previews, PR state. |
| Agents | What work is running or ready to review? | Copilot/Claude/Codex/OpenCode tasks, fleet runs, provider status, budgets, blockers. |
| Review Inbox | What should I approve, comment on, or merge? | Permission requests, PR reviews, checks, diff review queues, deploy confirmations. |
| Create | What new project or branch should an agent start? | Natural-language brief, templates, plan, provider/runtime choice, repo setup. |
| Runtime Center | Where does execution happen? | GitHub Actions, Codespaces, Claude Remote Control, Codex cloud/CLI, OpenCode server, SSH/local companion. |
| Settings/Admin | What accounts, policies, models, budgets, and privacy controls apply? | GitHub auth, providers, runtimes, permissions, enterprise policy, audit exports. |

### 6.2 Workspace architecture

Default iPad regular-width workspace:

- **Left sidebar:** repository switcher, file tree/search, issues/PR tabs, branch/status.
- **Center canvas:** editor, diff, preview, logs, or split editor/review.
- **Right inspector:** agent session, context, checks, runtime, comments, outline, blame.
- **Bottom accessory bar:** current branch, sync state, active provider, runtime health, command palette hint, pending approvals.

Compact/Split View workspace:

- Sidebar collapses to a rail.
- Inspector becomes a detachable sheet.
- Editor/review canvas gets priority.
- Agent composer can become a bottom drawer.

External display:

- iPad can host command/approval surface while external display hosts editor/review/preview.
- Multiwindow supports one window per workspace or one Review Inbox window plus one active workspace.

### 6.3 Navigation model

- Primary navigation uses an iPad sidebar with clear labels and badges.
- Workspace subnavigation uses tabs or segmented controls for "Files", "Agents", "Review", "Checks", "Preview".
- Command palette is global and searchable; it should never be the only way to perform an action.
- Deep links open exact objects: workspace, file line, diff hunk, agent turn, approval request, check log line, preview artifact.
- Breadcrumbs show `org / repo / branch / surface`, with provider/runtime in a nearby status chip.

### 6.4 Object model in the UI

Every major object should be represented by a consistent card or row:

- title;
- type;
- source/provider;
- status;
- timestamp;
- owner/assignee;
- affected files or repo;
- confidence/evidence summary where appropriate;
- next action.

This makes Home, Agent Board, Review Inbox, and Workspace inspectors feel like one product, not separate tools.

## 7. Primary surfaces

### 7.1 Home

Purpose: triage and resume.

Requirements:

- Recent workspaces with branch, provider, runtime, unread activity, and last open surface.
- "Needs you" section for approvals, failed checks, review comments, conflicts, offline runtimes, budget thresholds.
- Active agents grouped by repo, not provider-first.
- Quick actions: Open repo, New project, Start agent, Review PR, Connect runtime.
- Offline state: cached workspaces remain visible with clear staleness labels.
- Home should launch to useful content in under one second from a warm cache.

### 7.2 Workspace

Purpose: the central working environment.

Requirements:

- Editor, file tree, agent session, checks/logs, diff, preview, comments, runtime health, and PR metadata are one coherent workspace.
- User can switch center canvas mode without losing context.
- Agent composer is always close, but not always visually dominant.
- Workspace preserves tabs, split state, selected context, scroll positions, and pending drafts across app termination.
- Runtime/provider labels are visible enough to prevent accidental cross-provider work.

### 7.3 Agent composer

Purpose: issue precise instructions with visible context and constraints.

Requirements:

- Text entry supports natural language, slash commands, file/issue/log mentions, pasted screenshots, Pencil annotations, and drag/drop context.
- Context chips show source, scope, and risk: `file`, `folder`, `diff`, `issue`, `check`, `log`, `screenshot`, `preview`, `selection`.
- Provider/runtime/model/budget controls are visible before launch, with sensible defaults.
- Modes: Research, Plan, Implement, Review, Debug, Test, Refactor, Document, Scaffold, Deploy.
- "Plan first" is the safe default for complex or high-risk tasks.
- Composer remembers repo-specific instructions and suggests relevant commands based on current surface.

### 7.4 Agent Board and fleet comparison

Purpose: orchestrate parallel work.

Requirements:

- Board columns reflect lifecycle: Draft, Running, Needs approval, Reviewable, Blocked, Done.
- Cards show provider, runtime, branch, task, files changed, checks, cost/request status, conflicts, and confidence evidence.
- Compare mode shows plans, diffs, test results, screenshots/previews, and risks side by side.
- Fleet runs default to isolated branches/worktrees.
- Conflict warnings appear early, not only at merge time.

### 7.5 Review and diff

Purpose: make agent output safe to accept.

Requirements:

- Side-by-side and unified diff, hunk navigation, syntax highlighting, comments, suggested changes, staged review draft, and check annotations.
- Hunk-level actions: accept, reject, comment, ask agent, copy, open file, add to context.
- Agent provenance: who/what changed this hunk, prompt link, tool command, provider session, commit.
- Review summary: files changed, risk areas, tests run/not run, secret scan, generated files, dependency changes.
- Merge/deploy controls are gated behind checks and explicit confirmation.

### 7.6 Native editor

Purpose: allow serious edits without pretending the iPad is a desktop terminal.

Requirements:

- Fast typing, selection, multi-cursor where feasible, search/replace, symbols, outline, inline diagnostics, diff overlays, comments, blame, and conflict markers.
- Hardware keyboard shortcuts for navigation, edit, search, command palette, agent, review, and Git actions.
- Touch handles and contextual edit menus must feel native.
- Pencil can annotate code screenshots or diff regions, but should not be required for text editing.
- Large files degrade gracefully to read-only/streaming mode with a clear explanation.

### 7.7 Checks, logs, and terminal-adjacent views

Purpose: make remote execution inspectable.

Requirements:

- Logs stream progressively when available and are searchable.
- Errors summarize into actionable cards while preserving raw logs.
- Each command/log line shows execution source: GitHub Actions, Copilot cloud environment, Claude cloud, Codex cloud, Codespace, OpenCode Action, SSH/local runtime.
- "Send failure to agent" bundles relevant logs, files, check annotations, and branch state.
- Terminal-like views are monospaced, selectable, copyable, and visually separate from local app UI to avoid implying local execution.

### 7.8 Preview and deployment

Purpose: verify products visually and operationally.

Requirements:

- Preview cards show URL, provider, auth mode, environment, branch/PR, status, logs, screenshots, and last refresh.
- Screenshots can be marked up with Pencil and sent to an agent as context.
- Production deploys require critical confirmation and policy check.
- If embedded previews create App Review risk or provider limitations, open Safari or provider app via handoff.

### 7.9 Runtime Center

Purpose: explain and manage where work happens.

Requirements:

- Runtime tiles: Copilot cloud, GitHub Actions, Codespaces, Claude web, Claude Remote Control, Codex cloud, Codex CLI/IDE, OpenCode GitHub Action, OpenCode server, SSH/local companion.
- Each tile shows trust level, account, connection health, repo scope, capabilities, concurrency, network/secrets policy, and last use.
- Local/user-owned runtime setup uses explicit trust ceremonies, QR/deep link where possible, and revocation controls.
- Offline/asleep states are prominent and actionable.

### 7.10 Settings and administration

Purpose: make governance and personalization clear.

Requirements:

- Accounts: GitHub, Copilot, Claude, OpenAI/Codex, OpenCode, Codespaces, deployment providers.
- Preferences: theme, font, density, editor, keyboard bindings, default provider/runtime/model, notifications.
- Privacy: local cache, data retention, prompt retention, provider data flow, export/delete.
- Enterprise: allowed providers/models/runtimes, budgets, secret rules, network egress, audit export, MDM.
- Admin policy overrides are visible at point of use, not hidden only in settings.

## 8. Interaction model

### 8.1 Core workflow grammar

The product should make agent work feel like a structured loop:

1. **Ask**: compose with selected context, provider/runtime/model/budget.
2. **Plan**: agent explains approach, files, commands, risks, and expected outputs.
3. **Approve**: user approves plan or specific tool/risk requests.
4. **Run**: remote/provider runtime executes; app shows progress and evidence.
5. **Observe**: user monitors status, logs, changed files, checks, preview.
6. **Steer**: user sends follow-up, edits context, pauses, or branches off another agent.
7. **Review**: diff, tests, preview, comments, and provenance.
8. **Ship**: create/update PR, merge, deploy, or archive.
9. **Recover**: revert, retry, compare, restore draft, or open provider source.

### 8.2 Input modes

| Input | Primary uses | Requirements |
| --- | --- | --- |
| Touch | Navigate, review, approve, drag context, operate sheets | 44pt+ practical targets for primary controls; no hover-only actions. |
| Hardware keyboard | Editing, command palette, quick navigation, review, agent commands | Discoverable shortcuts via system keyboard overlay; no essential workflow without keyboard alternative. |
| Pointer/trackpad | Precision selection, hunk actions, tree navigation, hover previews | Pointer effects reinforce target shape; hover reveals but does not hide required state. |
| Apple Pencil | Annotate screenshots/previews/diffs, sketch UI feedback, select visual regions | Low-latency ink, lasso/markup tools, convert annotations into context chips. |
| Drag and drop | Add files/issues/logs/screenshots to context, move tabs, stage hunks | Drop targets highlight scope and resulting action before commit. |
| Voice/dictation | Prompt drafting, quick follow-up while mobile | Treat as text input with edit step before sending. |

### 8.3 Command palette

The command palette is a universal accelerator:

- Search commands, files, symbols, issues, PRs, agent sessions, settings.
- Supports action phrases: "run tests", "open failing check", "start Copilot on issue 42", "compare agents".
- Shows keyboard shortcuts and provider/runtime requirements.
- Commands that mutate state open confirmation/approval sheets, not immediate destructive action.

### 8.4 Context interaction

Context chips are draggable, reorderable, inspectable, and removable. A chip should answer:

- What is included?
- Why is it included?
- How fresh is it?
- Who can see it?
- Which provider/runtime will receive it?
- Does it include secrets, PII, generated files, or large cost impact?

### 8.5 Undo, checkpoints, and recovery

- Every local draft edit has undo.
- Every agent session has a durable timeline and branch/commit evidence.
- User can revert a local draft, reject a hunk, request a reverse patch, archive a session, or abandon a branch.
- Named checkpoints should exist for long-running agent sessions and major review moments.
- "Panic button" for user-owned runtimes: stop session, disconnect runtime, revoke trust, open audit.

## 9. iPad-specific UX

### 9.1 Layout adaptation

Design for these contexts from the start:

- 11-inch iPad landscape with keyboard.
- 13-inch iPad landscape with keyboard/trackpad.
- Portrait tablet without keyboard.
- Split View 1/2 and 1/3 widths.
- Stage Manager floating sizes.
- External display with iPad as controller or secondary surface.

Requirements:

- The center work canvas always has priority.
- Sidebars collapse predictably.
- Inspectors become sheets when width is constrained.
- Popovers never cover the active line/hunk if avoidable.
- The app restores layout per workspace and per display configuration.

### 9.2 Multitasking and multiwindow

- Support multiple windows for different repos, PRs, or review queues.
- Drag a PR/agent/session into a new window.
- Stage Manager window titles include repo and branch.
- Handoff/deep links preserve object identity and scroll position where feasible.

### 9.3 Apple Pencil

Pencil is most valuable for visual thinking:

- Annotate screenshot/preview/diff and attach as agent context.
- Circle UI bugs, draw arrows, highlight spacing issues, mark visual regressions.
- Use lasso to select visual regions in screenshots.
- Provide "Send annotation to agent" and "Attach to PR comment".
- Do not require Pencil for core developer actions.

### 9.4 Files, share, and drag/drop

- Import screenshots, logs, design files, markdown specs, and snippets through Files/share sheet.
- Export patch, transcript, audit bundle, screenshot, or PR summary.
- Drag files from Files into context; drag generated files out where permissions allow.
- Clearly label local cached files vs GitHub source-of-truth files.

### 9.5 Offline and resume

- Cached repos, drafts, prompts, annotations, review comments, and read-only transcripts remain accessible offline.
- Offline banners distinguish "local draft available" from "provider state unavailable."
- On reconnect, app reconciles branch, PR, checks, comments, and provider task state.
- Fast resume should return to the last active workspace before polling all background state.

### 9.6 Performance feel

The app must feel native even when provider data is slow:

- Typing never waits on network.
- File tree/search loads progressively.
- Logs and diffs virtualize long content.
- Heavy parsing/indexing is cancellable and visibly scoped.
- Skeletons reserve layout; spinners alone are insufficient for complex surfaces.

## 10. Accessibility

Accessibility is a launch requirement and a design quality differentiator.

### 10.1 VoiceOver

Requirements:

- Top-level navigation, workspace panes, command palette, agent status, approval sheets, and settings are fully navigable.
- Diff hunks expose semantic summaries: file, line range, additions/deletions, comments, check annotations, agent provenance.
- Code editor exposes current line/column, selection, diagnostics, modified status, and line actions.
- Agent timelines read as structured events, not raw chat blobs.
- Risk level and status are announced with words, not color alone.

### 10.2 Keyboard accessibility

- Full keyboard navigation across Home, workspace, editor, diff, logs, and settings.
- Visible focus rings that work in light/dark/high contrast.
- No keyboard trap in editor, web preview, or terminal-like log surface.
- Shortcuts are remappable or at least conflict-aware.

### 10.3 Dynamic Type and text sizing

- App chrome supports Dynamic Type.
- Editor font size and line height are independently adjustable.
- Diff metadata, comments, approval sheets, and logs remain usable at larger text sizes.
- Dense mode cannot override accessibility text settings.

### 10.4 Color, contrast, and motion

- High contrast themes for app UI, editor, diffs, and logs.
- Status is encoded by icon, text, shape, and position in addition to color.
- Reduced motion replaces spatial transitions with fades or instant state changes.
- Avoid flashing or rapid progress animations.

### 10.5 Cognitive accessibility

- Complex approvals use structured bullets and plain language.
- Error messages state what happened, why it likely happened, what the user can do, and whether work is safe.
- Onboarding introduces one concept at a time.
- Long agent outputs get summaries and anchors.

## 11. Motion, haptics, and audio

### 11.1 Motion principles

Motion should clarify state and preserve spatial continuity:

- Sidebar collapse/expand shows where panels went.
- Agent card moves through lifecycle columns.
- Review hunk accept/reject animates to a completed stack.
- Provider/runtimes connecting use subtle progress, not decorative loops.
- Diff comparisons use minimal transitions to avoid fatigue.

Motion should be fast and interruptible. Default durations should feel near-system: short for controls, slightly longer for sheet transitions, never blocking content.

### 11.2 Haptics

iPad hardware support varies, so haptics must be optional enhancement, not an information channel. Where system/hardware support exists:

- light confirmation for successful approval or hunk accept;
- warning feedback before critical/destructive confirmation;
- subtle Pencil-related feedback if supported by the device/accessory.

Every haptic event must have visual and/or audio equivalents and respect system settings.

### 11.3 Audio

Audio is off by default except for system notification behavior. Optional sounds can support:

- long-running task complete;
- approval needed;
- critical failure;
- budget threshold.

Requirements:

- Respect silent mode, Focus, notification settings, and accessibility.
- Provide separate controls for sound, haptics, and push notifications.
- Never use repetitive "AI is typing" audio.

## 12. Onboarding

### 12.1 First-run sequence

Onboarding should be short, honest, and capability-driven:

1. **Promise:** "Build, review, and steer agent work from iPad."
2. **Remote execution model:** explain that builds/tests/agents run in GitHub/provider/user-owned runtimes, not arbitrary code inside the iPad app.
3. **GitHub sign-in:** native web auth, scopes explained in plain language.
4. **Repository access:** choose GitHub App installation/repositories; show least-privilege recommendations.
5. **Copilot availability:** detect plan/capability where APIs permit; explain limitations.
6. **Optional providers:** Claude, Codex/OpenAI, OpenCode, Codespaces, local runtime.
7. **Choose first workflow:** Open repo, Create app, Review PR, Continue agent, Connect runtime.
8. **Teach by doing:** launch a safe plan-only task against a real connected repository, or stay in an honest empty state until one is connected.

### 12.2 Provider connection UX

Each provider setup screen must show:

- what account is used;
- what data leaves the app/GitHub;
- what execution environment runs code;
- what billing/subscription path applies;
- what capabilities and limitations the app can control natively;
- how to disconnect/revoke.

### 12.3 Local runtime onboarding

Local/user-owned runtime connection must feel like pairing a sensitive device:

- clear explanation that the machine executes commands and can access local files;
- QR/deep link or copyable bootstrap;
- identity verification and health check;
- repo scope selection;
- capability review;
- test command;
- explicit trust confirmation;
- easy disconnect/revoke.

### 12.4 Learning system

- First-time tooltips appear only at moments of need.
- Keyboard shortcut overlay is always available.
- Learning surfaces must not fabricate workspaces, repositories, reviews, approvals, or provider runs; they can explain the flow and then require a real connected repository before acting.
- "Why am I seeing this?" links explain provider limits, policies, and risk tiers.

## 13. Empty, loading, and error states

### 13.1 Empty states

Empty states should invite productive action:

| Surface | Empty state |
| --- | --- |
| Home | "Connect GitHub to open repositories and agent sessions." Actions: Sign in, Learn remote execution. |
| Workspace | "No file selected." Actions: search files, open recent, ask agent about repo, open issue. |
| Agent Board | "No active agents." Actions: start from issue, create plan, run fleet, connect provider. |
| Review Inbox | "Nothing needs your review." Show recent merged/reviewed work and notification settings. |
| Runtime Center | "No user-owned runtimes connected." Explain cloud defaults and advanced local runtime option. |
| Preview | "No preview available." Explain supported preview sources and how to request one. |

### 13.2 Loading states

- Use skeletons for known layouts.
- Use staged progress for long operations: authenticating, fetching repo, indexing, launching agent, waiting for provider, streaming logs, running checks.
- Show source and freshness: "Fetched from GitHub 1m ago", "Polling Codex", "Cached offline".
- Allow cancellation where safe.
- Avoid blocking the entire workspace if one provider is slow.

### 13.3 Error states

Error messages should be specific:

- Auth expired
- SSO required
- Missing repo permission
- Provider unavailable
- Runtime offline/asleep
- Branch conflict
- Check failed
- Budget threshold reached
- Secret detected
- Policy blocked
- App Review-safe preview unavailable
- Large file degraded

Each error includes:

- what happened;
- affected object;
- whether user work is safe;
- primary recovery action;
- secondary actions;
- source link/log where available.

### 13.4 Blocked agent states

Agent blocked cards should never be vague. They show:

- blocking reason;
- who/what can unblock;
- last successful step;
- pending tool/permission;
- affected files/commands;
- safe fallback.

## 14. Trust and safety UX

### 14.1 Permission tiers

Use the PRD risk model visually:

| Tier | Visual treatment | UX rule |
| --- | --- | --- |
| Low | neutral chip | Can auto-allow under policy; still logged. |
| Medium | blue/amber sheet | Require session approval or configured trust. |
| High | amber/red sheet | Explicit approval with rationale, affected resources, and alternatives. |
| Critical | full confirmation sheet | Requires policy check, typed/strong confirmation where appropriate, and audit entry. |

### 14.2 Approval sheet content

Every approval sheet includes:

- action requested;
- agent/provider/runtime;
- exact command/API call where possible;
- rationale from agent;
- files, domains, secrets, environment, and branch affected;
- risk tier;
- cost/budget impact if known;
- policy status;
- alternatives: deny, edit, ask for safer plan, open source docs/logs.

### 14.3 Secrets and sensitive data

- Secret-looking text in prompts, logs, diffs, screenshots, and files is flagged before being sent to providers.
- Secrets are represented as handles, not raw values.
- If a provider/runtime cannot safely receive a secret, the UI says so plainly.
- Redaction indicators are visible in transcripts and logs.
- Users can reveal secure values only in dedicated secure views with audit.

### 14.4 Provider and billing transparency

Before launch, show:

- provider;
- model if available;
- account;
- runtime;
- billing path: subscription, API key, enterprise, GitHub Actions minutes, user-owned compute;
- approximate/request budget if known;
- limitations: no streaming, no API control, no secrets store, no preview, etc.

Do not imply exact token/cost precision if provider APIs do not provide it.

### 14.5 Audit and provenance

- Every agent event links to provider task/session, GitHub branch/commit/PR/check, local runtime log, or local app event.
- PR descriptions should include session links where provider supports stable URLs.
- Audit export should be readable: timestamp, actor, provider, runtime, action, result, risk, approval, object IDs.

### 14.6 Enterprise policy UX

- Policy blocks appear at point of action with the admin-defined reason.
- Users can request exception or choose allowed alternative if configured.
- Org policy overrides local preferences clearly.
- Admin screens provide simulation: "Would this action be allowed?"

## 15. Design system components

### 15.1 Core components

| Component | Description | Required states |
| --- | --- | --- |
| App shell | Sidebar + content + inspector + accessory bar | regular, compact, external display, offline, policy locked |
| Workspace card | Resume object for repo/branch | active agent, failing checks, pending review, offline, archived |
| Agent card | Lifecycle summary | draft, planning, running, approval, reviewable, failed, blocked, merged |
| Provider chip | Provider identity and capability | connected, degraded, unsupported, policy blocked, billing warning |
| Runtime tile | Execution environment | healthy, connecting, offline, asleep, untrusted, limited |
| Context chip | Selected source for prompt | file, folder, selection, diff, issue, PR, check, log, screenshot, preview |
| Approval sheet | Risk decision UI | medium, high, critical, policy blocked, edited command |
| Diff hunk | Reviewable code change | added, deleted, modified, conflicted, generated, agent provenance, comments |
| Check card | CI/test result | queued, running, passed, failed, cancelled, skipped, rerun available |
| Log viewer | Remote output | streaming, paused, filtered, error summary, raw source |
| Preview card | App/deployment preview | building, ready, auth required, expired, failed, screenshot captured |
| Command palette | Search/action overlay | empty, filtered, destructive command, shortcut shown |
| Keyboard overlay | Shortcut discovery | global, editor, review, agent, logs |
| Empty state | Actionable zero state | new user, no data, filtered empty, offline empty |
| Toast/banner | Lightweight status | success, info, warning, error, undo available |

### 15.2 Agent timeline component

The timeline is a core trust component. Events include:

- Prompt submitted
- Context bundle created
- Plan proposed
- Approval requested/granted/denied
- Command/tool started/completed
- File read/written
- Commit/branch/PR created
- Check started/completed
- Preview/deploy created
- User follow-up
- Failure/blocker
- Session archived/merged

Each event can expand to raw details. Timeline search filters by file, command, risk, provider, and outcome.

### 15.3 Review summary component

For any agent output, the summary includes:

- files changed by category;
- generated vs edited vs deleted files;
- dependency/config changes;
- tests/checks run;
- tests/checks not run;
- secret scan status;
- accessibility/UI screenshots if available;
- provider/runtime;
- open risks;
- recommended review path.

### 15.4 Model and budget picker

The picker shows:

- provider and model;
- capability notes;
- plan/subscription/API-key path;
- cost/request estimate if available;
- monthly/session budget;
- policy constraints;
- speed/depth tradeoff where provider exposes it.

It should not gamify expensive choices. Use clear labels such as "Best for quick edits" and "Best for complex refactors" only when supported by provider behavior or internal evaluation.

## 16. Competitor and reference analysis

### 16.1 Summary table

| Product/reference | What works well | Weakness/opportunity | Design response for this product |
| --- | --- | --- | --- |
| GitHub Copilot cloud agent + GitHub Mobile | GitHub-native task/PR/check flow; background work; mobile remote control; visible plans/files/commands; private sessions. | Mobile is primarily a session/review control surface, not a full iPad-native workspace/editor. | Make GitHub the source of truth but add native iPad workspace, editor, diff, preview, fleet board, and Pencil review. |
| GitHub PR/Checks experience | Familiar review, branch protection, checks, comments, merge controls. | Dense desktop/web UI can be awkward on iPad and fragmented from agent chat. | Build a native review inbox with hunk actions, check summaries, provenance, and touch/keyboard/Pencil review. |
| Cursor | Strong AI-native desktop IDE, inline context, agent/composer patterns, rules/MCP ecosystem, familiar VS Code base. | Desktop-first; assumes local editor/runtime and mouse/keyboard density. | Borrow contextual agent UX and codebase awareness, but redesign around iPad layouts, remote execution labels, and touch-safe review. |
| OpenAI Codex | Cloud delegation, parallel background tasks, GitHub integration, IDE sidebar, approval modes, follow-up on cloud work. | Provider-specific surfaces; desktop IDE centric; iPad-native review/control gap. | Normalize Codex as a provider card with cloud task status, branch/PR review, budget labels, and handoff links. |
| Claude Code web + Remote Control | Clear distinction between cloud sessions and local-machine remote control; persistent sessions; mobile monitoring; QR/session list; local environment continuity. | Claude-specific; cloud secrets/resource limits; remote control depends on user's machine staying online. | Adopt the mental model: "where this runs" is always visible. Provide runtime health, offline/asleep states, and cloud-vs-local labeling. |
| Windsurf Cascade | Plan/todo list inside conversation, queued messages, tool calls, real-time awareness, checkpoints/reverts, multiple Cascades. | Desktop IDE assumptions; high autonomy can feel opaque if not paired with strong review/governance. | Use living plans and queued messages, but anchor them in explicit approvals, GitHub provenance, and iPad review surfaces. |
| Replit Agent | Excellent prompt-to-app flow, plan mode, checkpoints, integrated previews, simulator/emulator, beginner-friendly deployment path. | Platform/hosting-centric and less pro GitHub/team review oriented; can feel opaque for complex architecture. | Borrow guided creation and preview feedback; keep repo-first source, PR/check rigor, provider/runtime transparency. |
| OpenCode | Open source, terminal/desktop/IDE options, plan/build modes, GitHub Action integration, undo/redo, many providers, server mode. | Power-user setup; terminal metaphors; provider subscriptions vary; security burden for self-hosted modes. | Support OpenCode as advanced runtime with strong setup/trust UX, capability manifests, and clear provider/billing warnings. |
| CodeSandbox | Instant cloud dev environments, templates, collaboration, SDK/sandbox concepts for isolated execution. | Web-centric; iPad browser limitations and less native iPad interaction. | Treat cloud sandboxes as useful reference for preview speed, but keep native iPad UI and provider/user-owned execution. |
| StackBlitz WebContainers | Extremely fast browser-based Node-like environments and preview loop on supported browsers. | Browser technology constraints and mobile/iPadOS memory/support limitations; web surface, not native app. | Avoid betting V1 on browser-local execution; use previews/deep links where useful and communicate limitations. |
| Procreate Dreams | Apple Design Award-level iPad craft; touch/Pencil directness; powerful tools approachable to beginners. | Creative domain, not code; less audit/governance complexity. | Learn from direct manipulation, immediate feedback, and reduced chrome around the active canvas. |
| Shapr3D | Pro-grade capability with adaptive UI, focus, offline/multidevice workflows, direct manipulation. | Domain-specific; CAD tools differ from code review. | Learn "compact tools, space for focus": adaptive pro UI that hides clutter until needed. |
| Existing iPad dev tools such as Working Copy/Textastic/Blink/a-Shell | Strong specialized Git, editing, SSH, or terminal workflows; users trust them for focused tasks. | Fragmented; no unified agent + PR + checks + preview cockpit. | Integrate the full lifecycle while respecting specialized patterns users already understand. |

### 16.2 Patterns to adopt

- **Plan-first flows** for complex tasks.
- **Queued follow-ups** while agents run.
- **Session continuity** across devices and app restarts.
- **Checkpoint/revert metaphors** for agent changes.
- **Reviewable diffs before merge.**
- **GitHub-native PR/check/audit artifacts.**
- **Provider cloud delegation for long work.**
- **Visual preview and screenshot-to-agent loops.**
- **Context chips and file mentions.**
- **Direct manipulation for visual feedback with Pencil.**

### 16.3 Patterns to improve or avoid

- Avoid opaque "agent did it" completion states without tests/diffs/provenance.
- Avoid desktop sidebars with tiny controls and no touch ergonomics.
- Avoid provider-specific jargon in top-level UI; explain capabilities in product language.
- Avoid conflating cloud execution, local remote control, GitHub Actions, and on-device cache.
- Avoid hiding billing/model/runtime choices in settings.
- Avoid forcing users to inspect raw logs when a concise failure summary is possible.
- Avoid all-or-nothing context sharing; users should see and edit context scope.

## 17. Apple Design Award-level quality bar

Apple Design Awards recognize innovation, ingenuity, technical achievement, intuitive interaction, inclusivity, visual craft, and experiences tailored to the platform. For this app, that translates into the following bar.

### 17.1 Delight and Fun

Developer tools can delight through flow, not whimsy:

- Opening a workspace feels instant and purposeful.
- Agent progress is calm, readable, and satisfying.
- Accepting a hunk, resolving a conflict, or watching checks pass feels tactile and clear.
- Empty states invite action instead of scolding.
- The product has a few memorable moments: Pencil markup to agent context, side-by-side agent comparison, one-tap failure-to-agent bundle, polished keyboard overlay.

### 17.2 Inclusivity

- VoiceOver users can review agent status, approvals, diffs, and check summaries.
- Users with motor differences can operate the full app with keyboard or touch alternatives.
- Color-blind users can interpret all statuses.
- Dynamic Type users can read non-code UI comfortably.
- Localization is supported from V1.
- Cognitive load is reduced through structured states and plain-language risk copy.

### 17.3 Innovation

Innovation should come from uniquely iPad-native agentic development:

- multi-provider agent orchestration with visible runtimes;
- Pencil-to-prompt design feedback;
- native diff/review/check/preview loop;
- iPad as a control plane for GitHub/provider/user-owned execution;
- comparison of parallel agent attempts as a first-class surface.

### 17.4 Interaction

- All primary workflows are obvious after first use and efficient after repeated use.
- Touch, keyboard, pointer, and Pencil feel intentionally designed.
- Navigation remains stable across Stage Manager, Split View, and external display.
- Permission sheets make risky actions understandable without legalese.
- The app preserves context during long-running work and network changes.

### 17.5 Visuals and graphics

- Visual system is cohesive across editor, review, agents, settings, and onboarding.
- Dark mode is not an inversion; it is a designed theme.
- Syntax/diff/status colors are legible, semantic, and accessible.
- Icons are aligned with SF Symbols and custom symbols feel native.
- Motion supports comprehension and respects reduced motion.

### 17.6 Technical achievement

Design quality depends on implementation quality:

- Native scrolling and selection are smooth.
- Typing latency is imperceptible for normal files.
- Large diffs/logs are virtualized.
- State restoration is reliable.
- Offline/resume behavior is understandable.
- Crashes and data loss are treated as launch blockers.

## 18. Measurable design quality bar

### 18.1 Activation and onboarding metrics

| Metric | Target |
| --- | --- |
| First-run GitHub auth completion | >= 90% of users who start auth in supported environments |
| GitHub repo open after auth | <= 2 minutes median |
| First successful plan-only agent task | <= 5 minutes median from first repo open |
| Provider limitation comprehension | >= 85% of usability test participants can explain where code runs |
| Optional provider connection completion | >= 80% for users who start a supported provider flow |

### 18.2 Core task usability metrics

| Task | Target |
| --- | --- |
| Start an agent from an issue | <= 45 seconds after selecting issue |
| Understand active agent state | 5 seconds or less in moderated testing |
| Review a 300-line diff with comments | User can navigate hunks and submit review without training |
| Send failing check to agent | <= 3 actions from failed check summary |
| Compare two agent outputs | Key differences visible without opening raw logs |
| Approve/deny high-risk command | User can identify risk, affected resources, and alternatives before decision |

### 18.3 Performance and craft metrics

| Area | Target |
| --- | --- |
| Warm launch to Home | <= 1 second to cached content |
| Workspace resume | <= 2 seconds to last visible state, background refresh continues |
| Editor typing latency | Native-feeling; no network dependency |
| Scroll performance | 60fps target for normal editor/diff/log views |
| Large diff handling | Virtualized and usable for thousands of changed lines |
| Crash-free sessions | >= 99.8% beta target before public launch |
| State recovery | >= 99% successful restoration of tabs, drafts, sessions, and scroll positions in test suite |

### 18.4 Trust metrics

| Metric | Target |
| --- | --- |
| Secret redaction before provider send | 100% in seeded test cases |
| Destructive action without explicit approval | 0 |
| User can identify provider/runtime/billing path | >= 90% in usability tests |
| Revert/abandon path discoverability | >= 85% in usability tests |
| Policy block clarity | >= 85% of enterprise testers can state why action was blocked |

### 18.5 Accessibility metrics

| Area | Target |
| --- | --- |
| VoiceOver coverage | All primary workflows pass scripted QA |
| Keyboard-only operation | All primary workflows pass scripted QA |
| High contrast | Meets internal contrast thresholds for UI, diff, syntax overlays |
| Reduced motion | No essential information conveyed only by motion |
| Dynamic Type | Non-code UI usable at large sizes without truncating critical actions |

## 19. Design QA and validation plan

### 19.1 Device and input matrix

Test every primary workflow on:

- 11-inch iPad, portrait and landscape.
- 13-inch iPad, landscape with Magic Keyboard/trackpad.
- Split View 1/2 and 1/3.
- Stage Manager floating windows.
- External display.
- Touch only.
- Hardware keyboard only.
- Pointer/trackpad.
- Apple Pencil.
- VoiceOver.
- High contrast and reduced motion.
- Offline/reconnect.

### 19.2 Fixture workspaces

Maintain QA fixtures:

- small repo with simple issue;
- large monorepo;
- generated app with preview;
- failing checks;
- flaky provider task;
- giant log;
- giant diff;
- merge conflict;
- secret in diff/log/prompt;
- user-owned runtime offline/asleep;
- enterprise policy block;
- multi-agent conflict.

### 19.3 Design review checklist

Before a feature ships:

- Does it state provider, runtime, branch, and source of truth?
- Does it work with touch, keyboard, pointer, and accessible navigation?
- Is every destructive or high-cost action gated?
- Does it have empty/loading/error/offline states?
- Does it preserve state across app restart?
- Does it include audit/provenance?
- Does it avoid color-only meaning?
- Does it degrade in Split View?
- Does it respect reduced motion and large text?
- Does it provide a recovery path?

### 19.4 Usability testing

Run moderated tests with:

- solo builders;
- professional developers;
- engineering leads;
- designers/product engineers;
- accessibility users using VoiceOver/keyboard/large text;
- enterprise admins.

Core scenarios:

1. Connect GitHub and open a repo.
2. Start plan-only agent on an issue.
3. Approve a medium-risk test command.
4. Deny a high-risk destructive command and request alternative.
5. Review an agent diff with failing check.
6. Compare two agents and choose one.
7. Annotate a preview screenshot with Pencil and send feedback.
8. Recover from offline runtime.
9. Find audit/provenance for a changed file.

### 19.5 Beta quality gates

Public beta should not start until:

- design system covers all core components;
- primary workflows pass accessibility QA;
- top 20 shortcuts are discoverable and documented;
- no known data-loss issues;
- no unreviewed destructive action paths;
- large diff/log performance is acceptable;
- provider limitation copy is approved by product/legal/security;
- App Review notes align with remote execution UX;
- telemetry dashboards include activation, trust, performance, and accessibility signals.

## 20. Source notes

This PRD uses `docs/PRD.md` as product context and relies on official platform/product documentation wherever possible. Some competitor pages are dynamic; source notes list the canonical official URLs used for research.

| Topic | Source |
| --- | --- |
| Product context | `docs/PRD.md` |
| Apple Human Interface Guidelines | https://developer.apple.com/design/human-interface-guidelines |
| Designing for iPadOS | https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados |
| Apple HIG layout | https://developer.apple.com/design/human-interface-guidelines/layout |
| Apple HIG navigation and search | https://developer.apple.com/design/human-interface-guidelines/navigation-and-search |
| Apple HIG accessibility | https://developer.apple.com/design/human-interface-guidelines/accessibility |
| Apple HIG pointing devices | https://developer.apple.com/design/human-interface-guidelines/pointing-devices |
| Apple HIG keyboards | https://developer.apple.com/design/human-interface-guidelines/keyboards |
| Apple HIG drag and drop | https://developer.apple.com/design/human-interface-guidelines/drag-and-drop |
| Apple HIG color | https://developer.apple.com/design/human-interface-guidelines/color |
| Apple HIG typography | https://developer.apple.com/design/human-interface-guidelines/typography |
| Apple HIG motion | https://developer.apple.com/design/human-interface-guidelines/motion |
| Apple HIG playing haptics | https://developer.apple.com/design/human-interface-guidelines/playing-haptics |
| Apple HIG privacy | https://developer.apple.com/design/human-interface-guidelines/privacy |
| Apple Design Awards 2024 categories and winners | https://developer.apple.com/design/awards/2024/ |
| Apple Design Awards index | https://developer.apple.com/design/awards/ |
| App Store Review Guidelines | https://developer.apple.com/app-store/review/guidelines/#software-requirements |
| Apple SF Symbols | https://developer.apple.com/sf-symbols/ |
| Apple fonts / San Francisco / SF Mono | https://developer.apple.com/fonts/ |
| iPad Pro capability positioning | https://www.apple.com/ipad-pro/ |
| GitHub Copilot cloud agent | https://docs.github.com/en/copilot/concepts/coding-agent/about-copilot-coding-agent |
| GitHub Copilot remote sessions / GitHub Mobile | https://github.blog/news-insights/product-news/take-your-local-github-sessions-anywhere/ |
| GitHub Copilot Agent Tasks API | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api |
| Cursor official docs | https://docs.cursor.com/ |
| OpenAI Codex cloud | https://developers.openai.com/codex/cloud |
| OpenAI Codex IDE | https://developers.openai.com/codex/ide |
| OpenAI Codex GitHub integration | https://developers.openai.com/codex/integrations/github |
| Claude Code on the web | https://code.claude.com/docs/en/claude-code-on-the-web |
| Claude Code Remote Control | https://code.claude.com/docs/en/remote-control |
| Windsurf Cascade | https://docs.windsurf.com/windsurf/cascade/cascade |
| Replit Agent | https://docs.replit.com/references/agent/overview |
| Replit mobile app generation | https://docs.replit.com/replitai/building-mobile-apps |
| OpenCode overview | https://opencode.ai/docs |
| OpenCode GitHub integration | https://opencode.ai/docs/github |
| StackBlitz WebContainer API guide | https://webcontainers.io/guides |
| StackBlitz WebContainers browser support | https://developer.stackblitz.com/platform/webcontainers |
| CodeSandbox product/docs entry points | https://codesandbox.io/docs and https://codesandbox.io/ |
| Procreate Dreams product page | https://procreate.com/dreams |
| Procreate Dreams Apple Design Award note | https://procreate.com/insight/2024/apple-design-award-for-innovation |
| Shapr3D App Store listing | https://apps.apple.com/us/app/shapr3d-cad-modeling/id1091675654 |
