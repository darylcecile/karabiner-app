import Foundation

public struct StreamingSupport: Codable, Sendable, Hashable {
    public enum Transport: String, Codable, Sendable, Hashable, CaseIterable {
        case none
        case polling
        case serverSentEvents
        case webSocket
        case providerUI
        case fileBackedLog
    }

    public var transcript: Transport
    public var logs: Transport
    public var toolCalls: Transport
    public var diffUpdates: Transport

    public init(
        transcript: Transport,
        logs: Transport,
        toolCalls: Transport,
        diffUpdates: Transport
    ) {
        self.transcript = transcript
        self.logs = logs
        self.toolCalls = toolCalls
        self.diffUpdates = diffUpdates
    }

    public var hasRealtimeChannel: Bool {
        [transcript, logs, toolCalls, diffUpdates].contains { transport in
            transport == .serverSentEvents || transport == .webSocket
        }
    }

    public static let pollingOnly = StreamingSupport(transcript: .polling, logs: .polling, toolCalls: .polling, diffUpdates: .polling)
    public static let providerHandoff = StreamingSupport(transcript: .providerUI, logs: .providerUI, toolCalls: .providerUI, diffUpdates: .polling)
}
