import Foundation

public struct RepositoryRef: Codable, Hashable, Sendable {
    public var owner: String
    public var name: String
    public var defaultBranch: String?

    public init(owner: String, name: String, defaultBranch: String? = nil) {
        self.owner = owner
        self.name = name
        self.defaultBranch = defaultBranch
    }

    public var slug: String {
        "\(owner)/\(name)"
    }
}

public struct BranchRef: Codable, Hashable, Sendable {
    public var repository: RepositoryRef
    public var name: String

    public init(repository: RepositoryRef, name: String) {
        self.repository = repository
        self.name = name
    }
}

public struct WebLink: Codable, Hashable, Sendable {
    public var label: String
    public var url: URL

    public init(label: String, url: URL) {
        self.label = label
        self.url = url
    }
}

public enum ServiceFailure: Error, LocalizedError, Equatable, Sendable {
    case invalidConfiguration(String)
    case unsupportedCapability(String)
    case missingCredential(String)
    case authenticationRequired(String)
    case policyDenied(String)
    case unavailable(String)
    case rateLimited(retryAfter: Date?)
    case decoding(String)
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .invalidConfiguration(let message):
            "Invalid configuration: \(message)"
        case .unsupportedCapability(let message):
            "Unsupported capability: \(message)"
        case .missingCredential(let message):
            "Missing credential: \(message)"
        case .authenticationRequired(let message):
            "Authentication required: \(message)"
        case .policyDenied(let message):
            "Policy denied: \(message)"
        case .unavailable(let message):
            "Service unavailable: \(message)"
        case .rateLimited(let retryAfter):
            if let retryAfter {
                "Rate limited until \(retryAfter.formatted(.iso8601))"
            } else {
                "Rate limited"
            }
        case .decoding(let message):
            "Decoding failed: \(message)"
        case .transport(let message):
            "Transport failed: \(message)"
        }
    }
}

