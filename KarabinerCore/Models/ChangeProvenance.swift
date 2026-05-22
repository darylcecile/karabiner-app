import Foundation

public struct ChangeProvenance: Codable, Sendable, Hashable {
    public var sessionID: AgentSession.ID?
    public var providerID: AgentProviderDescriptor.ID?
    public var runtimeID: ExecutionRuntimeDescriptor.ID?
    public var promptSummary: String?
    public var toolInvocationID: ToolInvocation.ID?
    public var commitSHA: String?

    public init(
        sessionID: AgentSession.ID? = nil,
        providerID: AgentProviderDescriptor.ID? = nil,
        runtimeID: ExecutionRuntimeDescriptor.ID? = nil,
        promptSummary: String? = nil,
        toolInvocationID: ToolInvocation.ID? = nil,
        commitSHA: String? = nil
    ) {
        self.sessionID = sessionID
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.promptSummary = promptSummary
        self.toolInvocationID = toolInvocationID
        self.commitSHA = commitSHA
    }
}
