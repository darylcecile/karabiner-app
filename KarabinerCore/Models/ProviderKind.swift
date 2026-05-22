import Foundation

public enum ProviderKind: String, Codable, Sendable, Hashable, CaseIterable {
    case githubCopilot
    case claudeCode
    case openAICodex
    case openCode
    case codespaces
    case githubActions
    case ssh
    case custom

    public var isGitHubNative: Bool {
        switch self {
        case .githubCopilot, .codespaces, .githubActions:
            true
        case .claudeCode, .openAICodex, .openCode, .ssh, .custom:
            false
        }
    }
}
