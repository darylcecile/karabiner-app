import Foundation

public struct NetworkPolicy: Codable, Sendable, Hashable {
    public enum EgressMode: String, Codable, Sendable, Hashable, CaseIterable {
        case denied
        case providerDefault
        case allowlistedDomains
        case unrestrictedWithApproval
    }

    public var mode: EgressMode
    public var allowedDomains: Set<String>
    public var requiresApprovalForUnknownDomains: Bool

    public init(
        mode: EgressMode,
        allowedDomains: Set<String> = [],
        requiresApprovalForUnknownDomains: Bool = true
    ) {
        self.mode = mode
        self.allowedDomains = allowedDomains
        self.requiresApprovalForUnknownDomains = requiresApprovalForUnknownDomains
    }

    public func requiresApproval(for domain: String) -> Bool {
        switch mode {
        case .denied:
            true
        case .providerDefault:
            requiresApprovalForUnknownDomains
        case .allowlistedDomains:
            !allowedDomains.contains(domain)
        case .unrestrictedWithApproval:
            true
        }
    }
}
