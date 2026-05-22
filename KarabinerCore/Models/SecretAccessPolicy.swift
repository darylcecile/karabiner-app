import Foundation

public struct SecretAccessPolicy: Codable, Sendable, Hashable {
    public enum Mode: String, Codable, Sendable, Hashable, CaseIterable {
        case denied
        case handlesOnly
        case scopedRevealWithApproval
    }

    public var mode: Mode
    public var allowedSecretScopes: Set<String>
    public var auditEveryReveal: Bool

    public init(
        mode: Mode,
        allowedSecretScopes: Set<String> = [],
        auditEveryReveal: Bool = true
    ) {
        self.mode = mode
        self.allowedSecretScopes = allowedSecretScopes
        self.auditEveryReveal = auditEveryReveal
    }

    public func canUseHandle(scope: String) -> Bool {
        mode != .denied && (allowedSecretScopes.isEmpty || allowedSecretScopes.contains(scope))
    }
}
