import Foundation

public struct LogEvent: Identifiable, Codable, Sendable, Hashable {
    public enum Severity: String, Codable, Sendable, Hashable, CaseIterable {
        case trace
        case debug
        case info
        case warning
        case error
        case critical
    }

    public var id: String
    public var source: ExecutionSource
    public var sequence: Int
    public var timestamp: Date
    public var severity: Severity
    public var message: String
    public var isRedacted: Bool
    public var relatedCommandID: RemoteCommand.ID?
    public var relatedCheckRunID: CheckRun.ID?

    public init(
        id: String,
        source: ExecutionSource,
        sequence: Int,
        timestamp: Date,
        severity: Severity,
        message: String,
        isRedacted: Bool = false,
        relatedCommandID: RemoteCommand.ID? = nil,
        relatedCheckRunID: CheckRun.ID? = nil
    ) {
        self.id = id
        self.source = source
        self.sequence = sequence
        self.timestamp = timestamp
        self.severity = severity
        self.message = message
        self.isRedacted = isRedacted
        self.relatedCommandID = relatedCommandID
        self.relatedCheckRunID = relatedCheckRunID
    }
}
