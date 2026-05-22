import Foundation

public struct ToolInvocation: Identifiable, Codable, Sendable, Hashable {
    public enum Status: String, Codable, Sendable, Hashable, CaseIterable {
        case proposed
        case awaitingApproval
        case running
        case succeeded
        case failed
        case denied
        case cancelled
    }

    public var id: String
    public var sessionID: AgentSession.ID
    public var toolName: String
    public var inputSummary: String
    public var outputSummary: String?
    public var riskTier: RiskTier
    public var permissionGates: Set<PermissionGate>
    public var approvalRequestID: ApprovalRequest.ID?
    public var status: Status
    public var startedAt: Date?
    public var endedAt: Date?
    public var durationMilliseconds: Int?
    public var providerEventID: String?

    public init(
        id: String,
        sessionID: AgentSession.ID,
        toolName: String,
        inputSummary: String,
        outputSummary: String? = nil,
        riskTier: RiskTier,
        permissionGates: Set<PermissionGate> = [],
        approvalRequestID: ApprovalRequest.ID? = nil,
        status: Status,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        durationMilliseconds: Int? = nil,
        providerEventID: String? = nil
    ) {
        self.id = id
        self.sessionID = sessionID
        self.toolName = toolName
        self.inputSummary = inputSummary
        self.outputSummary = outputSummary
        self.riskTier = riskTier
        self.permissionGates = permissionGates
        self.approvalRequestID = approvalRequestID
        self.status = status
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationMilliseconds = durationMilliseconds
        self.providerEventID = providerEventID
    }

    public var needsApproval: Bool {
        riskTier.requiresExplicitApproval || !permissionGates.isEmpty
    }
}
