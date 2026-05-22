import Foundation

public struct DiffLine: Identifiable, Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case context
        case addition
        case deletion
        case hunkHeader
    }

    public var id: String
    public var kind: Kind
    public var oldLineNumber: Int?
    public var newLineNumber: Int?
    public var content: String
    public var githubPosition: Int?
    public var isNoNewlineMarker: Bool

    public init(
        id: String,
        kind: Kind,
        oldLineNumber: Int? = nil,
        newLineNumber: Int? = nil,
        content: String,
        githubPosition: Int? = nil,
        isNoNewlineMarker: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.oldLineNumber = oldLineNumber
        self.newLineNumber = newLineNumber
        self.content = content
        self.githubPosition = githubPosition
        self.isNoNewlineMarker = isNoNewlineMarker
    }
}
