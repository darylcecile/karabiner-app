import Foundation

public struct Workspace: Identifiable, Codable, Sendable, Hashable {
    public enum State: String, Codable, Sendable, Hashable, CaseIterable {
        case active
        case offlineCache
        case providerUnavailable
        case archived
        case policyLocked
    }

    public var id: String
    public var repositoryID: GitHubRepository.ID
    public var repositoryFullName: String
    public var branchName: String
    public var baseBranchName: String?
    public var state: State
    public var activeAgentSessionIDs: [AgentSession.ID]
    public var linkedPullRequestIDs: [PullRequest.ID]
    public var runtimeIDs: [ExecutionRuntimeDescriptor.ID]
    public var cacheSummary: CacheSummary
    public var lastOpenedAt: Date?

    public init(
        id: String,
        repositoryID: GitHubRepository.ID,
        repositoryFullName: String,
        branchName: String,
        baseBranchName: String? = nil,
        state: State,
        activeAgentSessionIDs: [AgentSession.ID] = [],
        linkedPullRequestIDs: [PullRequest.ID] = [],
        runtimeIDs: [ExecutionRuntimeDescriptor.ID] = [],
        cacheSummary: CacheSummary,
        lastOpenedAt: Date? = nil
    ) {
        self.id = id
        self.repositoryID = repositoryID
        self.repositoryFullName = repositoryFullName
        self.branchName = branchName
        self.baseBranchName = baseBranchName
        self.state = state
        self.activeAgentSessionIDs = activeAgentSessionIDs
        self.linkedPullRequestIDs = linkedPullRequestIDs
        self.runtimeIDs = runtimeIDs
        self.cacheSummary = cacheSummary
        self.lastOpenedAt = lastOpenedAt
    }

    public var isReviewable: Bool { state != .archived }
}
