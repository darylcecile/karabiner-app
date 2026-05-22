import Foundation

/// A user-initiated request to start a real agent session against an open workspace.
///
/// Passed from the UI through `KarabinerAppStore` to `AgentSessionLauncher`. No defaults are
/// fabricated: the caller must supply a real workspace backed by a loaded GitHub repository.
public struct StartAgentSessionRequest: Sendable {
    /// The open workspace that provides repository owner, name, and branch context.
    public var workspace: Workspace
    /// Non-empty task description sent verbatim to the provider.
    public var prompt: String
    /// Branch to base the agent's work on. Defaults to the workspace base branch when nil.
    public var baseRef: String?
    /// Provider model identifier, e.g. `"gpt-4o"`. Nil means provider default.
    public var model: String?
    /// Session interaction mode used to label the resulting `AgentSession`.
    public var mode: AgentSession.Mode
    /// Whether to ask the provider to open a pull request on completion.
    public var createPullRequest: Bool

    public init(
        workspace: Workspace,
        prompt: String,
        baseRef: String? = nil,
        model: String? = nil,
        mode: AgentSession.Mode = .interactive,
        createPullRequest: Bool = true
    ) {
        self.workspace = workspace
        self.prompt = prompt
        self.baseRef = baseRef
        self.model = model
        self.mode = mode
        self.createPullRequest = createPullRequest
    }
}
