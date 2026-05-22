import Foundation

public enum BillingPath: String, Codable, Sendable, Hashable, CaseIterable {
    case githubCopilotSubscription
    case chatGPTSubscription
    case claudeSubscription
    case providerAPIKey
    case enterpriseContract
    case githubActionsMinutes
    case codespacesQuota
    case userOwnedCompute
    case freeTier
    case unknown

    public var requiresCostDisclosure: Bool {
        switch self {
        case .freeTier:
            false
        case .githubCopilotSubscription, .chatGPTSubscription, .claudeSubscription, .providerAPIKey, .enterpriseContract, .githubActionsMinutes, .codespacesQuota, .userOwnedCompute, .unknown:
            true
        }
    }
}
