import Foundation

public enum AgentSessionStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case draft
    case planning
    case awaitingApproval
    case running
    case blocked
    case reviewable
    case failed
    case cancelled
    case abandoned
    case merged
    case archived

    public var isTerminal: Bool {
        switch self {
        case .failed, .cancelled, .abandoned, .merged, .archived:
            true
        case .draft, .planning, .awaitingApproval, .running, .blocked, .reviewable:
            false
        }
    }

    public var canExposeReviewArtifacts: Bool {
        switch self {
        case .reviewable, .failed, .merged, .archived:
            true
        case .draft, .planning, .awaitingApproval, .running, .blocked, .cancelled, .abandoned:
            false
        }
    }
}
