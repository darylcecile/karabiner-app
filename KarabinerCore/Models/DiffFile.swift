import Foundation

public struct DiffFile: Identifiable, Codable, Sendable, Hashable {
    public enum ChangeKind: String, Codable, Sendable, Hashable, CaseIterable {
        case added
        case modified
        case deleted
        case renamed
        case copied
        case unchanged
    }

    public var id: String
    public var path: String
    public var oldPath: String?
    public var changeKind: ChangeKind
    public var oldBlobSHA: String?
    public var newBlobSHA: String?
    public var additions: Int
    public var deletions: Int
    public var hunks: [DiffHunk]
    public var comments: [ReviewComment]
    public var isGenerated: Bool
    public var isLarge: Bool

    public init(
        id: String,
        path: String,
        oldPath: String? = nil,
        changeKind: ChangeKind,
        oldBlobSHA: String? = nil,
        newBlobSHA: String? = nil,
        additions: Int,
        deletions: Int,
        hunks: [DiffHunk] = [],
        comments: [ReviewComment] = [],
        isGenerated: Bool = false,
        isLarge: Bool = false
    ) {
        self.id = id
        self.path = path
        self.oldPath = oldPath
        self.changeKind = changeKind
        self.oldBlobSHA = oldBlobSHA
        self.newBlobSHA = newBlobSHA
        self.additions = additions
        self.deletions = deletions
        self.hunks = hunks
        self.comments = comments
        self.isGenerated = isGenerated
        self.isLarge = isLarge
    }
}
