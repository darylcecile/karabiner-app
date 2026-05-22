import Foundation

public struct GitHubConnection: Identifiable, Codable, Sendable, Hashable {
    public struct Installation: Identifiable, Codable, Sendable, Hashable {
        public var id: Int64
        public var accountLogin: String
        public var repositorySelection: RepositorySelection
        public var permissions: [String: String]

        public init(
            id: Int64,
            accountLogin: String,
            repositorySelection: RepositorySelection,
            permissions: [String: String]
        ) {
            self.id = id
            self.accountLogin = accountLogin
            self.repositorySelection = repositorySelection
            self.permissions = permissions
        }
    }

    public enum RepositorySelection: String, Codable, Sendable, Hashable, CaseIterable {
        case all
        case selected
    }

    public var id: String
    public var account: GitHubAccount
    public var authState: AuthState
    public var tokenScopes: Set<String>
    public var installations: [Installation]
    public var lastValidatedAt: Date?

    public init(
        id: String,
        account: GitHubAccount,
        authState: AuthState,
        tokenScopes: Set<String>,
        installations: [Installation] = [],
        lastValidatedAt: Date? = nil
    ) {
        self.id = id
        self.account = account
        self.authState = authState
        self.tokenScopes = tokenScopes
        self.installations = installations
        self.lastValidatedAt = lastValidatedAt
    }

    public func hasScopes(_ requiredScopes: Set<String>) -> Bool {
        requiredScopes.isSubset(of: tokenScopes)
    }
}
