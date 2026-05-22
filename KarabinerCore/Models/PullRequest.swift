import Foundation

public struct PullRequest: Identifiable, Codable, Sendable, Hashable {
    public enum State: String, Codable, Sendable, Hashable, CaseIterable {
        case open
        case closed
        case merged
        case draft
    }

    public enum MergeState: String, Codable, Sendable, Hashable, CaseIterable {
        case unknown
        case clean
        case dirty
        case blocked
        case behind
        case unstable
        case queued
        case merged
    }

    public var id: Int64
    public var number: Int
    public var repositoryID: GitHubRepository.ID
    public var title: String
    public var authorLogin: String
    public var state: State
    public var mergeState: MergeState
    public var baseRef: String
    public var headRef: String
    public var htmlURL: URL
    public var checkRunIDs: [CheckRun.ID]
    public var reviewDecision: String?

    public init(
        id: Int64,
        number: Int,
        repositoryID: GitHubRepository.ID,
        title: String,
        authorLogin: String,
        state: State,
        mergeState: MergeState,
        baseRef: String,
        headRef: String,
        htmlURL: URL,
        checkRunIDs: [CheckRun.ID] = [],
        reviewDecision: String? = nil
    ) {
        self.id = id
        self.number = number
        self.repositoryID = repositoryID
        self.title = title
        self.authorLogin = authorLogin
        self.state = state
        self.mergeState = mergeState
        self.baseRef = baseRef
        self.headRef = headRef
        self.htmlURL = htmlURL
        self.checkRunIDs = checkRunIDs
        self.reviewDecision = reviewDecision
    }

    public var requiresMergeApproval: Bool { state == .open || state == .draft }
}
