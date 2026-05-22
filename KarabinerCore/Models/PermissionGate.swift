import Foundation

public enum PermissionGate: String, Codable, Sendable, Hashable, CaseIterable {
    case destructiveCommand
    case secretAccess
    case networkAccess
    case deployment
    case billingImpactingUse
    case pullRequestMerge
    case forcePush
    case databaseMigration
    case publicURLExposure

    public var minimumRiskTier: RiskTier {
        switch self {
        case .networkAccess, .billingImpactingUse:
            .high
        case .destructiveCommand, .secretAccess, .deployment:
            .high
        case .pullRequestMerge, .forcePush, .databaseMigration, .publicURLExposure:
            .critical
        }
    }
}
