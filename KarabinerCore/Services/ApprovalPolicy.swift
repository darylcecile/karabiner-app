import Foundation

public enum ApprovalRiskTier: String, Codable, Hashable, Sendable, CaseIterable {
    case low
    case medium
    case high
    case critical
}

public enum ApprovalActionKind: String, Codable, Hashable, Sendable {
    case readRepository
    case writeRepository
    case createPullRequest
    case mergePullRequest
    case triggerWorkflow
    case runRemoteCommand
    case accessSecret
    case externalNetwork
    case deploy
    case spendBudget
    case localProcessExecution
}

public struct ApprovalContext: Codable, Hashable, Sendable {
    public var repository: RepositoryRef?
    public var providerID: AgentProviderID?
    public var runtimeID: String?
    public var userID: String?
    public var organizationID: String?

    public init(
        repository: RepositoryRef? = nil,
        providerID: AgentProviderID? = nil,
        runtimeID: String? = nil,
        userID: String? = nil,
        organizationID: String? = nil
    ) {
        self.repository = repository
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.userID = userID
        self.organizationID = organizationID
    }
}

public struct ApprovalPolicyRequest: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var action: ApprovalActionKind
    public var risk: ApprovalRiskTier
    public var summary: String
    public var rationale: String?
    public var affectedResources: [String]
    public var networkDomains: [String]
    public var secretReferences: [String]
    public var estimatedCostCents: Int?
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        action: ApprovalActionKind,
        risk: ApprovalRiskTier,
        summary: String,
        rationale: String? = nil,
        affectedResources: [String] = [],
        networkDomains: [String] = [],
        secretReferences: [String] = [],
        estimatedCostCents: Int? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.action = action
        self.risk = risk
        self.summary = summary
        self.rationale = rationale
        self.affectedResources = affectedResources
        self.networkDomains = networkDomains
        self.secretReferences = secretReferences
        self.estimatedCostCents = estimatedCostCents
        self.createdAt = createdAt
    }
}

public enum ApprovalDecision: Codable, Hashable, Sendable {
    case allow(reason: String, expiresAt: Date?)
    case requiresUserApproval(reason: String)
    case deny(reason: String)
}

public protocol ApprovalPolicyEvaluating: Sendable {
    func evaluate(_ request: ApprovalPolicyRequest, in context: ApprovalContext) async -> ApprovalDecision
}

public struct DefaultApprovalPolicy: ApprovalPolicyEvaluating, Sendable {
    public var autoAllowLowRiskReads: Bool
    public var allowedProviders: Set<AgentProviderID>?
    public var allowedRuntimes: Set<String>?
    public var allowedNetworkDomains: Set<String>?
    public var maxAutoApprovedCostCents: Int

    public init(
        autoAllowLowRiskReads: Bool = true,
        allowedProviders: Set<AgentProviderID>? = nil,
        allowedRuntimes: Set<String>? = nil,
        allowedNetworkDomains: Set<String>? = nil,
        maxAutoApprovedCostCents: Int = 0
    ) {
        self.autoAllowLowRiskReads = autoAllowLowRiskReads
        self.allowedProviders = allowedProviders
        self.allowedRuntimes = allowedRuntimes
        self.allowedNetworkDomains = allowedNetworkDomains
        self.maxAutoApprovedCostCents = maxAutoApprovedCostCents
    }

    public func evaluate(_ request: ApprovalPolicyRequest, in context: ApprovalContext) async -> ApprovalDecision {
        if request.action == .localProcessExecution {
            return .deny(reason: "The iPad app is a control plane and must not run arbitrary project processes locally.")
        }
        if let allowedProviders, let providerID = context.providerID, !allowedProviders.contains(providerID) {
            return .deny(reason: "Provider \(providerID.rawValue) is not allowed by policy.")
        }
        if let allowedRuntimes, let runtimeID = context.runtimeID, !allowedRuntimes.contains(runtimeID) {
            return .deny(reason: "Runtime \(runtimeID) is not allowed by policy.")
        }
        if let allowedNetworkDomains {
            let deniedDomains = request.networkDomains.filter { !allowedNetworkDomains.contains($0) }
            if !deniedDomains.isEmpty {
                return .requiresUserApproval(reason: "External network access requires review: \(deniedDomains.joined(separator: ", ")).")
            }
        }
        if !request.secretReferences.isEmpty || request.action == .accessSecret {
            return .requiresUserApproval(reason: "Secret access requires explicit approval.")
        }
        if request.action == .mergePullRequest || request.action == .deploy {
            return .requiresUserApproval(reason: "Merges and deployments require explicit user approval.")
        }
        if let estimatedCostCents = request.estimatedCostCents, estimatedCostCents > maxAutoApprovedCostCents {
            return .requiresUserApproval(reason: "Estimated billing impact exceeds the auto-approval limit.")
        }
        switch request.risk {
        case .low where autoAllowLowRiskReads && request.action == .readRepository:
            return .allow(reason: "Low-risk repository read is allowed by policy.", expiresAt: nil)
        case .low:
            return .requiresUserApproval(reason: "Low-risk action is not configured for auto-approval.")
        case .medium, .high, .critical:
            return .requiresUserApproval(reason: "\(request.risk.rawValue.capitalized) risk action requires review.")
        }
    }
}
