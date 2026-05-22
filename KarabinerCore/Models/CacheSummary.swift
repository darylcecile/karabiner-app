import Foundation

public struct CacheSummary: Codable, Sendable, Hashable {
    public var fileCount: Int
    public var dirtyDraftCount: Int
    public var totalBytes: Int64
    public var lastIndexedAt: Date?
    public var indexRef: String?
    public var isSearchIndexFresh: Bool

    public init(
        fileCount: Int,
        dirtyDraftCount: Int,
        totalBytes: Int64,
        lastIndexedAt: Date? = nil,
        indexRef: String? = nil,
        isSearchIndexFresh: Bool
    ) {
        self.fileCount = fileCount
        self.dirtyDraftCount = dirtyDraftCount
        self.totalBytes = totalBytes
        self.lastIndexedAt = lastIndexedAt
        self.indexRef = indexRef
        self.isSearchIndexFresh = isSearchIndexFresh
    }

    public var hasOfflineWork: Bool { dirtyDraftCount > 0 }
}
