import Foundation

public struct Preview: Identifiable, Codable, Sendable, Hashable {
    public enum Status: String, Codable, Sendable, Hashable, CaseIterable {
        case unavailable
        case starting
        case running
        case failed
        case stopped
        case expired
    }

    public enum AuthMode: String, Codable, Sendable, Hashable, CaseIterable {
        case publicURL
        case providerAuthenticated
        case githubAuthenticated
        case vpnOrPrivateNetwork
        case unknown
    }

    public var id: String
    public var url: URL
    public var providerID: AgentProviderDescriptor.ID?
    public var runtimeID: ExecutionRuntimeDescriptor.ID?
    public var branchName: String
    public var pullRequestID: PullRequest.ID?
    public var authMode: AuthMode
    public var status: Status
    public var logArtifactIDs: [ReviewableArtifact.ID]
    public var screenshotArtifactIDs: [ReviewableArtifact.ID]
    public var lastRefreshedAt: Date?

    public init(
        id: String,
        url: URL,
        providerID: AgentProviderDescriptor.ID? = nil,
        runtimeID: ExecutionRuntimeDescriptor.ID? = nil,
        branchName: String,
        pullRequestID: PullRequest.ID? = nil,
        authMode: AuthMode,
        status: Status,
        logArtifactIDs: [ReviewableArtifact.ID] = [],
        screenshotArtifactIDs: [ReviewableArtifact.ID] = [],
        lastRefreshedAt: Date? = nil
    ) {
        self.id = id
        self.url = url
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.branchName = branchName
        self.pullRequestID = pullRequestID
        self.authMode = authMode
        self.status = status
        self.logArtifactIDs = logArtifactIDs
        self.screenshotArtifactIDs = screenshotArtifactIDs
        self.lastRefreshedAt = lastRefreshedAt
    }

    public var requiresCriticalApprovalBeforeProductionUse: Bool {
        authMode == .publicURL && status == .running
    }
}
