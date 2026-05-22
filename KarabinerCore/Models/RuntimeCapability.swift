import Foundation

public enum RuntimeCapability: String, Codable, Sendable, Hashable, CaseIterable {
    case fileRead
    case fileWrite
    case shellCommands
    case buildCommands
    case testCommands
    case dependencyInstall
    case previews
    case lsp
    case modelSelection
    case taskLifecycle
    case streamingLogs
    case artifacts
    case pullRequestWrites
    case budgetTelemetry
    case secretHandles
    case networkEgressPolicy
    case deployment

    public var defaultRiskTier: RiskTier {
        switch self {
        case .fileRead, .modelSelection, .taskLifecycle, .streamingLogs, .artifacts, .budgetTelemetry:
            .low
        case .fileWrite, .buildCommands, .testCommands, .previews, .lsp:
            .medium
        case .shellCommands, .dependencyInstall, .pullRequestWrites, .secretHandles, .networkEgressPolicy:
            .high
        case .deployment:
            .critical
        }
    }
}
