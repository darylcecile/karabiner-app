import Foundation

public struct PolicyDecision: Codable, Sendable, Hashable {
    public enum Outcome: String, Codable, Sendable, Hashable, CaseIterable {
        case allowed
        case requiresApproval
        case blocked
        case unknown
    }

    public var outcome: Outcome
    public var reason: String?
    public var policyID: String?

    public init(outcome: Outcome, reason: String? = nil, policyID: String? = nil) {
        self.outcome = outcome
        self.reason = reason
        self.policyID = policyID
    }

    public var permitsExecution: Bool { outcome == .allowed || outcome == .requiresApproval }
}
