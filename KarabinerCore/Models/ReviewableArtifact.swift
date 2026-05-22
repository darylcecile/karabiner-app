import Foundation

public struct ReviewableArtifact: Identifiable, Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case plan
        case toolCall
        case diff
        case command
        case testResult
        case preview
        case pullRequest
        case checkRun
        case log
        case auditEvent
    }

    public enum State: String, Codable, Sendable, Hashable, CaseIterable {
        case draft
        case pendingReview
        case approved
        case rejected
        case superseded
        case archived
    }

    public var id: String
    public var kind: Kind
    public var title: String
    public var state: State
    public var sourceProviderID: AgentProviderDescriptor.ID?
    public var sessionID: AgentSession.ID?
    public var riskTier: RiskTier
    public var createdAt: Date
    public var updatedAt: Date
    public var stableURL: URL?

    public init(
        id: String,
        kind: Kind,
        title: String,
        state: State,
        sourceProviderID: AgentProviderDescriptor.ID? = nil,
        sessionID: AgentSession.ID? = nil,
        riskTier: RiskTier = .low,
        createdAt: Date,
        updatedAt: Date,
        stableURL: URL? = nil
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.state = state
        self.sourceProviderID = sourceProviderID
        self.sessionID = sessionID
        self.riskTier = riskTier
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.stableURL = stableURL
    }

    public var isActionableReview: Bool { state == .pendingReview }
}
