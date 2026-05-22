import Foundation

public struct GitHubRepository: Identifiable, Codable, Sendable, Hashable {
    public enum Visibility: String, Codable, Sendable, Hashable, CaseIterable {
        case `private`
        case `public`
        case `internal`
    }

    public struct Permissions: Codable, Sendable, Hashable {
        public var canRead: Bool
        public var canWrite: Bool
        public var canAdmin: Bool
        public var canCreatePullRequest: Bool
        public var canMergePullRequest: Bool

        public init(
            canRead: Bool,
            canWrite: Bool,
            canAdmin: Bool,
            canCreatePullRequest: Bool,
            canMergePullRequest: Bool
        ) {
            self.canRead = canRead
            self.canWrite = canWrite
            self.canAdmin = canAdmin
            self.canCreatePullRequest = canCreatePullRequest
            self.canMergePullRequest = canMergePullRequest
        }
    }

    public var id: Int64
    public var ownerLogin: String
    public var name: String
    public var visibility: Visibility
    public var defaultBranch: String
    public var htmlURL: URL
    public var cloneURL: URL?
    public var permissions: Permissions
    public var isArchived: Bool
    public var isFork: Bool

    public init(
        id: Int64,
        ownerLogin: String,
        name: String,
        visibility: Visibility,
        defaultBranch: String,
        htmlURL: URL,
        cloneURL: URL? = nil,
        permissions: Permissions,
        isArchived: Bool = false,
        isFork: Bool = false
    ) {
        self.id = id
        self.ownerLogin = ownerLogin
        self.name = name
        self.visibility = visibility
        self.defaultBranch = defaultBranch
        self.htmlURL = htmlURL
        self.cloneURL = cloneURL
        self.permissions = permissions
        self.isArchived = isArchived
        self.isFork = isFork
    }

    public var fullName: String { "\(ownerLogin)/\(name)" }
}
