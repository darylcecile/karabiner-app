import Foundation

public struct AuditEvent: Identifiable, Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case authentication
        case repositoryAccess
        case agentAction
        case toolInvocation
        case command
        case fileChange
        case approval
        case deployment
        case pullRequest
        case merge
        case secretAccess
        case policyDecision
    }

    public enum Result: String, Codable, Sendable, Hashable, CaseIterable {
        case succeeded
        case failed
        case denied
        case blocked
        case cancelled
        case informational
    }

    public var id: String
    public var timestamp: Date
    public var actorLogin: String
    public var kind: Kind
    public var result: Result
    public var riskTier: RiskTier
    public var providerID: AgentProviderDescriptor.ID?
    public var runtimeID: ExecutionRuntimeDescriptor.ID?
    public var sessionID: AgentSession.ID?
    public var approvalRequestID: ApprovalRequest.ID?
    public var objectReference: String?
    public var summary: String

    public init(
        id: String,
        timestamp: Date,
        actorLogin: String,
        kind: Kind,
        result: Result,
        riskTier: RiskTier = .low,
        providerID: AgentProviderDescriptor.ID? = nil,
        runtimeID: ExecutionRuntimeDescriptor.ID? = nil,
        sessionID: AgentSession.ID? = nil,
        approvalRequestID: ApprovalRequest.ID? = nil,
        objectReference: String? = nil,
        summary: String
    ) {
        self.id = id
        self.timestamp = timestamp
        self.actorLogin = actorLogin
        self.kind = kind
        self.result = result
        self.riskTier = riskTier
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.sessionID = sessionID
        self.approvalRequestID = approvalRequestID
        self.objectReference = objectReference
        self.summary = summary
    }
}
