import Foundation

public struct ExecutionRuntimeDescriptor: Identifiable, Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case onDeviceCache
        case githubHostedAgent
        case githubActions
        case codespace
        case providerCloud
        case providerRemoteControl
        case openCodeServer
        case sshHost
        case desktopCompanion
        case externalDeploymentProvider

        public var permitsProjectCodeExecution: Bool {
            switch self {
            case .onDeviceCache:
                false
            case .githubHostedAgent, .githubActions, .codespace, .providerCloud, .providerRemoteControl, .openCodeServer, .sshHost, .desktopCompanion, .externalDeploymentProvider:
                true
            }
        }
    }

    public enum TrustLevel: String, Codable, Sendable, Hashable, CaseIterable {
        case providerManaged
        case githubManaged
        case userOwnedVerified
        case userOwnedUnverified
        case localCacheOnly
    }

    public enum Health: String, Codable, Sendable, Hashable, CaseIterable {
        case healthy
        case degraded
        case connecting
        case offline
        case asleep
        case unavailable
        case untrusted
    }

    public var id: String
    public var kind: Kind
    public var displayName: String
    public var providerID: AgentProviderDescriptor.ID?
    public var accountLabel: String?
    public var health: Health
    public var trustLevel: TrustLevel
    public var repositoryScope: [String]
    public var capabilities: Set<RuntimeCapability>
    public var apiLimits: APILimits
    public var networkPolicy: NetworkPolicy
    public var secretPolicy: SecretAccessPolicy
    public var lastUsedAt: Date?

    public init(
        id: String,
        kind: Kind,
        displayName: String,
        providerID: AgentProviderDescriptor.ID? = nil,
        accountLabel: String? = nil,
        health: Health,
        trustLevel: TrustLevel,
        repositoryScope: [String] = [],
        capabilities: Set<RuntimeCapability>,
        apiLimits: APILimits,
        networkPolicy: NetworkPolicy,
        secretPolicy: SecretAccessPolicy,
        lastUsedAt: Date? = nil
    ) {
        self.id = id
        self.kind = kind
        self.displayName = displayName
        self.providerID = providerID
        self.accountLabel = accountLabel
        self.health = health
        self.trustLevel = trustLevel
        self.repositoryScope = repositoryScope
        self.capabilities = capabilities
        self.apiLimits = apiLimits
        self.networkPolicy = networkPolicy
        self.secretPolicy = secretPolicy
        self.lastUsedAt = lastUsedAt
    }

    public var canRunProjectCodeRemotely: Bool {
        kind.permitsProjectCodeExecution && health == .healthy
    }

    public func validationIssuesForProjectExecution() -> [String] {
        var issues: [String] = []
        if !kind.permitsProjectCodeExecution {
            issues.append("Project code execution is not allowed on the iPad local cache runtime.")
        }
        if health != .healthy {
            issues.append("Runtime is not healthy: \(health.rawValue).")
        }
        if trustLevel == .userOwnedUnverified || health == .untrusted {
            issues.append("Runtime requires an explicit trust ceremony before execution.")
        }
        return issues
    }
}
