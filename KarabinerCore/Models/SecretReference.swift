import Foundation

public struct SecretReference: Identifiable, Codable, Sendable, Hashable {
    public enum StorageLocation: String, Codable, Sendable, Hashable, CaseIterable {
        case keychain
        case githubSecrets
        case providerSecrets
        case userRuntimeVault
        case externalSecretManager
    }

    public var id: String
    public var displayName: String
    public var scope: String
    public var storageLocation: StorageLocation
    public var providerID: AgentProviderDescriptor.ID?
    public var repositoryID: GitHubRepository.ID?
    public var lastUsedAt: Date?

    public init(
        id: String,
        displayName: String,
        scope: String,
        storageLocation: StorageLocation,
        providerID: AgentProviderDescriptor.ID? = nil,
        repositoryID: GitHubRepository.ID? = nil,
        lastUsedAt: Date? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.scope = scope
        self.storageLocation = storageLocation
        self.providerID = providerID
        self.repositoryID = repositoryID
        self.lastUsedAt = lastUsedAt
    }
}
