import Foundation

public struct ExecutionSource: Codable, Sendable, Hashable {
    public enum Kind: String, Codable, Sendable, Hashable, CaseIterable {
        case githubActions
        case copilotCloud
        case claudeCloud
        case codexCloud
        case codespace
        case openCodeAction
        case openCodeServer
        case sshRuntime
        case desktopCompanion
        case deploymentProvider
        case localAppCache
    }

    public var kind: Kind
    public var displayName: String
    public var providerID: AgentProviderDescriptor.ID?
    public var runtimeID: ExecutionRuntimeDescriptor.ID?
    public var stableURL: URL?

    public init(
        kind: Kind,
        displayName: String,
        providerID: AgentProviderDescriptor.ID? = nil,
        runtimeID: ExecutionRuntimeDescriptor.ID? = nil,
        stableURL: URL? = nil
    ) {
        self.kind = kind
        self.displayName = displayName
        self.providerID = providerID
        self.runtimeID = runtimeID
        self.stableURL = stableURL
    }

    public var isLocalExecution: Bool { kind == .localAppCache }
}
