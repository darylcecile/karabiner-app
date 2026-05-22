import Foundation

public struct RemoteCommand: Identifiable, Codable, Sendable, Hashable {
    public enum Intent: String, Codable, Sendable, Hashable, CaseIterable {
        case inspect
        case build
        case test
        case lint
        case installDependencies
        case startPreview
        case deploy
        case migrateDatabase
        case mutateGitHistory
        case mergePullRequest
    }

    public var id: String
    public var runtimeID: ExecutionRuntimeDescriptor.ID
    public var sessionID: AgentSession.ID?
    public var intent: Intent
    public var displayCommand: String
    public var workingDirectory: String?
    public var riskTier: RiskTier
    public var approvalRequestID: ApprovalRequest.ID?
    public var createdAt: Date

    public init(
        id: String,
        runtimeID: ExecutionRuntimeDescriptor.ID,
        sessionID: AgentSession.ID? = nil,
        intent: Intent,
        displayCommand: String,
        workingDirectory: String? = nil,
        riskTier: RiskTier,
        approvalRequestID: ApprovalRequest.ID? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.runtimeID = runtimeID
        self.sessionID = sessionID
        self.intent = intent
        self.displayCommand = displayCommand
        self.workingDirectory = workingDirectory
        self.riskTier = riskTier
        self.approvalRequestID = approvalRequestID
        self.createdAt = createdAt
    }

    public func validationIssues(using runtime: ExecutionRuntimeDescriptor) -> [String] {
        runtime.validationIssuesForProjectExecution()
    }
}
