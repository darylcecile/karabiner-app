import Foundation

public enum AuthState: String, Codable, Sendable, Hashable, CaseIterable {
    case disconnected
    case connecting
    case connected
    case expired
    case ssoRequired
    case permissionRequired
    case revoked
    case unavailable

    public var canStartSession: Bool { self == .connected }
}
