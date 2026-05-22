import Foundation

public struct AgentTurn: Identifiable, Codable, Sendable, Hashable {
    public enum Role: String, Codable, Sendable, Hashable, CaseIterable {
        case user
        case assistant
        case system
        case tool
        case reviewer
    }

    public var id: String
    public var sessionID: AgentSession.ID
    public var role: Role
    public var contentSummary: String
    public var contextBundleIDs: [String]
    public var outputArtifactIDs: [ReviewableArtifact.ID]
    public var createdAt: Date
    public var providerEventID: String?

    public init(
        id: String,
        sessionID: AgentSession.ID,
        role: Role,
        contentSummary: String,
        contextBundleIDs: [String] = [],
        outputArtifactIDs: [ReviewableArtifact.ID] = [],
        createdAt: Date,
        providerEventID: String? = nil
    ) {
        self.id = id
        self.sessionID = sessionID
        self.role = role
        self.contentSummary = contentSummary
        self.contextBundleIDs = contextBundleIDs
        self.outputArtifactIDs = outputArtifactIDs
        self.createdAt = createdAt
        self.providerEventID = providerEventID
    }
}
