import Foundation

public struct ProviderLifecycleSupport: Codable, Sendable, Hashable {
    public var canDraft: Bool
    public var canStart: Bool
    public var canPause: Bool
    public var canResume: Bool
    public var canCancel: Bool
    public var canArchive: Bool
    public var canReplayEvents: Bool
    public var stableProviderURL: Bool

    public init(
        canDraft: Bool,
        canStart: Bool,
        canPause: Bool,
        canResume: Bool,
        canCancel: Bool,
        canArchive: Bool,
        canReplayEvents: Bool,
        stableProviderURL: Bool
    ) {
        self.canDraft = canDraft
        self.canStart = canStart
        self.canPause = canPause
        self.canResume = canResume
        self.canCancel = canCancel
        self.canArchive = canArchive
        self.canReplayEvents = canReplayEvents
        self.stableProviderURL = stableProviderURL
    }

    public static let taskAPI = ProviderLifecycleSupport(
        canDraft: true,
        canStart: true,
        canPause: false,
        canResume: false,
        canCancel: true,
        canArchive: true,
        canReplayEvents: true,
        stableProviderURL: true
    )

    public static let handoffOnly = ProviderLifecycleSupport(
        canDraft: true,
        canStart: false,
        canPause: false,
        canResume: false,
        canCancel: false,
        canArchive: true,
        canReplayEvents: false,
        stableProviderURL: true
    )
}
