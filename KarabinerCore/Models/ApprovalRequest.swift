import Foundation

public struct ApprovalRequest: Identifiable, Codable, Sendable, Hashable {
    public enum Status: String, Codable, Sendable, Hashable, CaseIterable {
        case pending
        case approved
        case denied
        case edited
        case expired
        case policyBlocked
    }

    public var id: String
    public var sessionID: AgentSession.ID
    public var action: String
    public var rationale: String
    public var exactCommandOrAPICall: String?
    public var providerID: AgentProviderDescriptor.ID
    public var runtimeID: ExecutionRuntimeDescriptor.ID
    public var branchName: String
    public var riskTier: RiskTier
    public var gates: Set<PermissionGate>
    public var affectedResources: [AffectedResource]
    public var costImpact: BudgetImpact?
    public var policyDecision: PolicyDecision
    public var alternatives: [String]
    public var status: Status
    public var requestedAt: Date
    public var resolvedAt: Date?

    public init(
        id: String,
        sessionID: AgentSession.ID,
        action: String,
        rationale: String,
        exactCommandOrAPICall: String? = nil,
        providerID: AgentProviderDescriptor.ID,
        runtimeID: ExecutionRuntimeDescriptor.ID,
        branchName: String,
        riskTier: RiskTier,
        gates: Set<PermissionGate>,
        affectedResources: [AffectedResource],
        costImpact: BudgetImpact? = nil,
        policyDecision: PolicyDecision,
        alternatives: [String] = [],
        status: Status,
        requestedAt: Date,
        resolvedAt: Date? = nil
    ) {
        self.id = id
        self.sessionID = sessionID
        self.action = action
        self.rationale = rationale
        self.exactCommandOrAPICall = exactCommandOrAPICall
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.branchName = branchName
        self.riskTier = riskTier
        self.gates = gates
        self.affectedResources = affectedResources
        self.costImpact = costImpact
        self.policyDecision = policyDecision
        self.alternatives = alternatives
        self.status = status
        self.requestedAt = requestedAt
        self.resolvedAt = resolvedAt
    }

    public var canProceed: Bool {
        status == .approved && policyDecision.permitsExecution
    }

    public var needsStrongConfirmation: Bool {
        riskTier.requiresStrongConfirmation || gates.contains { $0.minimumRiskTier == .critical }
    }
}
