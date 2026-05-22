import Foundation

public enum RiskTier: String, Codable, Sendable, Hashable, CaseIterable, Comparable {
    case low
    case medium
    case high
    case critical

    public static func < (lhs: RiskTier, rhs: RiskTier) -> Bool {
        lhs.sortOrder < rhs.sortOrder
    }

    private var sortOrder: Int {
        switch self {
        case .low: 0
        case .medium: 1
        case .high: 2
        case .critical: 3
        }
    }

    public var requiresExplicitApproval: Bool {
        switch self {
        case .low:
            false
        case .medium, .high, .critical:
            true
        }
    }

    public var requiresPolicyCheck: Bool {
        switch self {
        case .low, .medium:
            false
        case .high, .critical:
            true
        }
    }

    public var requiresStrongConfirmation: Bool { self == .critical }

    public var defaultBehaviorDescription: String {
        switch self {
        case .low:
            "Auto-allow only when repository policy permits; always log."
        case .medium:
            "Require session approval or preconfigured trust."
        case .high:
            "Require explicit approval with rationale, affected resources, and alternatives."
        case .critical:
            "Require explicit approval, policy check, strong confirmation, and audit entry."
        }
    }
}
