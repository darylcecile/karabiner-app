import Foundation

public struct APILimits: Codable, Sendable, Hashable {
    public enum Precision: String, Codable, Sendable, Hashable, CaseIterable {
        case exact
        case providerReported
        case estimated
        case unavailable
    }

    public var requestsPerMinute: Int?
    public var requestsPerHour: Int?
    public var concurrentSessions: Int?
    public var maxContextTokens: Int?
    public var maxRuntimeMinutes: Int?
    public var precision: Precision
    public var notes: [String]

    public init(
        requestsPerMinute: Int? = nil,
        requestsPerHour: Int? = nil,
        concurrentSessions: Int? = nil,
        maxContextTokens: Int? = nil,
        maxRuntimeMinutes: Int? = nil,
        precision: Precision,
        notes: [String] = []
    ) {
        self.requestsPerMinute = requestsPerMinute
        self.requestsPerHour = requestsPerHour
        self.concurrentSessions = concurrentSessions
        self.maxContextTokens = maxContextTokens
        self.maxRuntimeMinutes = maxRuntimeMinutes
        self.precision = precision
        self.notes = notes
    }

    public var shouldAvoidExactCostClaims: Bool { precision != .exact && precision != .providerReported }
}
