import Foundation

public enum ProviderAuthMethod: String, Codable, Sendable, Hashable, CaseIterable {
    case githubOAuth
    case providerOAuth
    case deviceCode
    case apiKey
    case githubApp
    case sshKey
    case serverPassword
    case deepLinkHandoff
    case none

    public var storesSecretMaterial: Bool {
        switch self {
        case .apiKey, .sshKey, .serverPassword:
            true
        case .githubOAuth, .providerOAuth, .deviceCode, .githubApp, .deepLinkHandoff, .none:
            false
        }
    }
}
