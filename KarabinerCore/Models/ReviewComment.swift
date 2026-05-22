import Foundation

public struct ReviewComment: Identifiable, Codable, Sendable, Hashable {
    public enum State: String, Codable, Sendable, Hashable, CaseIterable {
        case draft
        case pending
        case submitted
        case resolved
        case outdated
    }

    public var id: String
    public var authorLogin: String
    public var body: String
    public var path: String
    public var newLine: Int?
    public var originalLine: Int?
    public var githubPosition: Int?
    public var state: State
    public var createdAt: Date
    public var updatedAt: Date?

    public init(
        id: String,
        authorLogin: String,
        body: String,
        path: String,
        newLine: Int? = nil,
        originalLine: Int? = nil,
        githubPosition: Int? = nil,
        state: State,
        createdAt: Date,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.authorLogin = authorLogin
        self.body = body
        self.path = path
        self.newLine = newLine
        self.originalLine = originalLine
        self.githubPosition = githubPosition
        self.state = state
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
