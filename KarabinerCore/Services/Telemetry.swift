import Foundation
import OSLog

public enum TelemetryCategory: String, Codable, Hashable, Sendable {
    case auth
    case github
    case provider
    case runtime
    case approval
    case diagnostics
}

public enum TelemetryPrivacy: String, Codable, Hashable, Sendable {
    case operational
    case userInitiated
    case sensitive
}

public struct TelemetryEvent: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var name: String
    public var category: TelemetryCategory
    public var privacy: TelemetryPrivacy
    public var attributes: [String: String]
    public var measurements: [String: Double]
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        category: TelemetryCategory,
        privacy: TelemetryPrivacy = .operational,
        attributes: [String: String] = [:],
        measurements: [String: Double] = [:],
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.privacy = privacy
        self.attributes = attributes
        self.measurements = measurements
        self.createdAt = createdAt
    }
}

public protocol TelemetryRecording: Sendable {
    func record(_ event: TelemetryEvent) async
}

public struct NoopTelemetryRecorder: TelemetryRecording, Sendable {
    public init() {}

    public func record(_ event: TelemetryEvent) async {}
}

public actor InMemoryTelemetryRecorder: TelemetryRecording {
    private var recordedEvents: [TelemetryEvent] = []

    public init() {}

    public func record(_ event: TelemetryEvent) async {
        recordedEvents.append(event)
    }

    public func events() async -> [TelemetryEvent] {
        recordedEvents
    }
}

public final class OSLogTelemetryRecorder: TelemetryRecording, @unchecked Sendable {
    private let logger: Logger

    public init(subsystem: String = Bundle.main.bundleIdentifier ?? "Karabiner", category: String = "Telemetry") {
        self.logger = Logger(subsystem: subsystem, category: category)
    }

    public func record(_ event: TelemetryEvent) async {
        let attributes = event.privacy == .sensitive ? "<redacted>" : event.attributes.description
        logger.log(level: .info, "\(event.category.rawValue, privacy: .public).\(event.name, privacy: .public) \(attributes, privacy: .private)")
    }
}

