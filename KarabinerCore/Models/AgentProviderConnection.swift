import Foundation

public struct AgentProviderConnection: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var providerID: AgentProviderDescriptor.ID
    public var providerKind: ProviderKind
    public var accountLabel: String
    public var accountID: String?
    public var authState: AuthState
    public var billingPath: BillingPath
    public var activeAuthMethod: ProviderAuthMethod
    public var capabilityManifest: ProviderCapabilityManifest
    public var apiLimits: APILimits
    public var connectedAt: Date?
    public var lastValidatedAt: Date?

    public init(
        id: String,
        providerID: AgentProviderDescriptor.ID,
        providerKind: ProviderKind,
        accountLabel: String,
        accountID: String? = nil,
        authState: AuthState,
        billingPath: BillingPath,
        activeAuthMethod: ProviderAuthMethod,
        capabilityManifest: ProviderCapabilityManifest,
        apiLimits: APILimits,
        connectedAt: Date? = nil,
        lastValidatedAt: Date? = nil
    ) {
        self.id = id
        self.providerID = providerID
        self.providerKind = providerKind
        self.accountLabel = accountLabel
        self.accountID = accountID
        self.authState = authState
        self.billingPath = billingPath
        self.activeAuthMethod = activeAuthMethod
        self.capabilityManifest = capabilityManifest
        self.apiLimits = apiLimits
        self.connectedAt = connectedAt
        self.lastValidatedAt = lastValidatedAt
    }

    public var canLaunchAgentSession: Bool {
        authState.canStartSession && capabilityManifest.lifecycle.canStart
    }
}
