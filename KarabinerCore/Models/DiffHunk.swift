import Foundation

public struct DiffHunk: Identifiable, Codable, Sendable, Hashable {
    public enum ReviewState: String, Codable, Sendable, Hashable, CaseIterable {
        case unreviewed
        case accepted
        case rejected
        case commented
        case needsAgentFollowUp
    }

    public var id: String
    public var header: String
    public var oldStartLine: Int
    public var oldLineCount: Int
    public var newStartLine: Int
    public var newLineCount: Int
    public var lines: [DiffLine]
    public var reviewState: ReviewState
    public var provenance: ChangeProvenance?

    public init(
        id: String,
        header: String,
        oldStartLine: Int,
        oldLineCount: Int,
        newStartLine: Int,
        newLineCount: Int,
        lines: [DiffLine],
        reviewState: ReviewState = .unreviewed,
        provenance: ChangeProvenance? = nil
    ) {
        self.id = id
        self.header = header
        self.oldStartLine = oldStartLine
        self.oldLineCount = oldLineCount
        self.newStartLine = newStartLine
        self.newLineCount = newLineCount
        self.lines = lines
        self.reviewState = reviewState
        self.provenance = provenance
    }
}
