import Foundation

public struct ProviderCapabilityManifest: Codable, Sendable, Hashable {
    public var lifecycle: ProviderLifecycleSupport
    public var streaming: StreamingSupport
    public var runtimeCapabilities: Set<RuntimeCapability>
    public var supportedBillingPaths: Set<BillingPath>
    public var supportsOfficialSubscriptionAuth: Bool
    public var supportsBYOK: Bool
    public var supportsPullRequestWrites: Bool
    public var supportsSecrets: Bool
    public var limitationNotes: [String]

    public init(
        lifecycle: ProviderLifecycleSupport,
        streaming: StreamingSupport,
        runtimeCapabilities: Set<RuntimeCapability>,
        supportedBillingPaths: Set<BillingPath>,
        supportsOfficialSubscriptionAuth: Bool,
        supportsBYOK: Bool,
        supportsPullRequestWrites: Bool,
        supportsSecrets: Bool,
        limitationNotes: [String] = []
    ) {
        self.lifecycle = lifecycle
        self.streaming = streaming
        self.runtimeCapabilities = runtimeCapabilities
        self.supportedBillingPaths = supportedBillingPaths
        self.supportsOfficialSubscriptionAuth = supportsOfficialSubscriptionAuth
        self.supportsBYOK = supportsBYOK
        self.supportsPullRequestWrites = supportsPullRequestWrites
        self.supportsSecrets = supportsSecrets
        self.limitationNotes = limitationNotes
    }

    public func supports(_ capability: RuntimeCapability) -> Bool {
        runtimeCapabilities.contains(capability)
    }

    public func missingCapabilities(from requiredCapabilities: Set<RuntimeCapability>) -> Set<RuntimeCapability> {
        requiredCapabilities.subtracting(runtimeCapabilities)
    }
}
