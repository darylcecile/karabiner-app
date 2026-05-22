import Foundation

public struct AgentProviderDescriptor: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var kind: ProviderKind
    public var displayName: String
    public var officialAuthMethods: Set<ProviderAuthMethod>
    public var repositoryAccessDescription: String
    public var executionEnvironmentDescription: String
    public var defaultCapabilityManifest: ProviderCapabilityManifest
    public var documentationURL: URL?
    public var isDefaultProvider: Bool

    public init(
        id: String,
        kind: ProviderKind,
        displayName: String,
        officialAuthMethods: Set<ProviderAuthMethod>,
        repositoryAccessDescription: String,
        executionEnvironmentDescription: String,
        defaultCapabilityManifest: ProviderCapabilityManifest,
        documentationURL: URL? = nil,
        isDefaultProvider: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.displayName = displayName
        self.officialAuthMethods = officialAuthMethods
        self.repositoryAccessDescription = repositoryAccessDescription
        self.executionEnvironmentDescription = executionEnvironmentDescription
        self.defaultCapabilityManifest = defaultCapabilityManifest
        self.documentationURL = documentationURL
        self.isDefaultProvider = isDefaultProvider
    }
}
