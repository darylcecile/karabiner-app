import Foundation

public struct Diff: Identifiable, Codable, Sendable, Hashable {
    public enum ReviewState: String, Codable, Sendable, Hashable, CaseIterable {
        case unreviewed
        case inReview
        case changesRequested
        case approved
        case merged
        case closed
    }

    public var id: String
    public var repositoryID: GitHubRepository.ID
    public var baseRef: String
    public var headRef: String
    public var mergeBaseSHA: String?
    public var files: [DiffFile]
    public var reviewState: ReviewState
    public var checkRunIDs: [CheckRun.ID]
    public var pullRequestID: PullRequest.ID?
    public var generatedAt: Date

    public init(
        id: String,
        repositoryID: GitHubRepository.ID,
        baseRef: String,
        headRef: String,
        mergeBaseSHA: String? = nil,
        files: [DiffFile],
        reviewState: ReviewState,
        checkRunIDs: [CheckRun.ID] = [],
        pullRequestID: PullRequest.ID? = nil,
        generatedAt: Date
    ) {
        self.id = id
        self.repositoryID = repositoryID
        self.baseRef = baseRef
        self.headRef = headRef
        self.mergeBaseSHA = mergeBaseSHA
        self.files = files
        self.reviewState = reviewState
        self.checkRunIDs = checkRunIDs
        self.pullRequestID = pullRequestID
        self.generatedAt = generatedAt
    }

    public var totalAdditions: Int { files.reduce(0) { $0 + $1.additions } }
    public var totalDeletions: Int { files.reduce(0) { $0 + $1.deletions } }
}
