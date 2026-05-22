import Foundation

public struct AffectedResource: Identifiable, Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case file
        case directory
        case command
        case domain
        case secret
        case environment
        case branch
        case pullRequest
        case deployment
        case budget
        case runtime
    }

    public var id: String
    public var kind: Kind
    public var displayName: String
    public var reference: String
    public var isSensitive: Bool

    public init(id: String, kind: Kind, displayName: String, reference: String, isSensitive: Bool = false) {
        self.id = id
        self.kind = kind
        self.displayName = displayName
        self.reference = reference
        self.isSensitive = isSensitive
    }
}
