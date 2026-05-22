import Foundation

public struct CheckRun: Identifiable, Codable, Sendable, Hashable {
    public enum Status: String, Codable, Sendable, Hashable, CaseIterable {
        case queued
        case inProgress
        case completed
        case waiting
        case requested
        case pending
    }

    public enum Conclusion: String, Codable, Sendable, Hashable, CaseIterable {
        case success
        case failure
        case neutral
        case cancelled
        case skipped
        case timedOut
        case actionRequired
        case unknown
    }

    public var id: String
    public var repositoryID: GitHubRepository.ID
    public var name: String
    public var source: ExecutionSource
    public var status: Status
    public var conclusion: Conclusion?
    public var detailsURL: URL?
    public var startedAt: Date?
    public var completedAt: Date?
    public var annotationsCount: Int

    public init(
        id: String,
        repositoryID: GitHubRepository.ID,
        name: String,
        source: ExecutionSource,
        status: Status,
        conclusion: Conclusion? = nil,
        detailsURL: URL? = nil,
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        annotationsCount: Int = 0
    ) {
        self.id = id
        self.repositoryID = repositoryID
        self.name = name
        self.source = source
        self.status = status
        self.conclusion = conclusion
        self.detailsURL = detailsURL
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.annotationsCount = annotationsCount
    }

    public var isPassing: Bool { status == .completed && conclusion == .success }
}
