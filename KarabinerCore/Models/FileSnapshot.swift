import Foundation

public struct FileSnapshot: Identifiable, Codable, Sendable, Hashable {
    public enum CacheState: String, Codable, Sendable, Hashable, CaseIterable {
        case notCached
        case metadataOnly
        case cached
        case stale
        case dirtyDraft
        case conflict
        case evicted
    }

    public enum Source: String, Codable, Sendable, Hashable, CaseIterable {
        case githubBlob
        case pullRequestDiff
        case localDraft
        case providerGenerated
        case artifact
    }

    public var id: String
    public var repositoryID: GitHubRepository.ID
    public var path: String
    public var ref: String
    public var blobSHA: String?
    public var contentHash: String?
    public var byteCount: Int64
    public var source: Source
    public var cacheState: CacheState
    public var isLarge: Bool
    public var isGenerated: Bool
    public var lastModifiedAt: Date?
    public var provenance: ChangeProvenance?

    public init(
        id: String,
        repositoryID: GitHubRepository.ID,
        path: String,
        ref: String,
        blobSHA: String? = nil,
        contentHash: String? = nil,
        byteCount: Int64,
        source: Source,
        cacheState: CacheState,
        isLarge: Bool = false,
        isGenerated: Bool = false,
        lastModifiedAt: Date? = nil,
        provenance: ChangeProvenance? = nil
    ) {
        self.id = id
        self.repositoryID = repositoryID
        self.path = path
        self.ref = ref
        self.blobSHA = blobSHA
        self.contentHash = contentHash
        self.byteCount = byteCount
        self.source = source
        self.cacheState = cacheState
        self.isLarge = isLarge
        self.isGenerated = isGenerated
        self.lastModifiedAt = lastModifiedAt
        self.provenance = provenance
    }

    public var isEditableOffline: Bool { cacheState == .cached || cacheState == .dirtyDraft }
}
