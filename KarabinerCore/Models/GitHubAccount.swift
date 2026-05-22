import Foundation

public struct GitHubAccount: Identifiable, Codable, Sendable, Hashable {
    public enum AccountKind: String, Codable, Sendable, Hashable, CaseIterable {
        case user
        case organization
        case enterprise
        case bot
    }

    public var id: Int64
    public var login: String
    public var displayName: String?
    public var kind: AccountKind
    public var avatarURL: URL?
    public var profileURL: URL?

    public init(
        id: Int64,
        login: String,
        displayName: String? = nil,
        kind: AccountKind,
        avatarURL: URL? = nil,
        profileURL: URL? = nil
    ) {
        self.id = id
        self.login = login
        self.displayName = displayName
        self.kind = kind
        self.avatarURL = avatarURL
        self.profileURL = profileURL
    }
}
