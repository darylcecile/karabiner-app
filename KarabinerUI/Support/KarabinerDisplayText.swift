import KarabinerCore
import SwiftUI

extension AgentSessionStatus {
    var displayName: String {
        switch self {
        case .draft:
            "Draft"
        case .planning:
            "Planning"
        case .awaitingApproval:
            "Needs approval"
        case .running:
            "Running"
        case .blocked:
            "Blocked"
        case .reviewable:
            "Reviewable"
        case .failed:
            "Failed"
        case .cancelled:
            "Cancelled"
        case .abandoned:
            "Abandoned"
        case .merged:
            "Merged"
        case .archived:
            "Archived"
        }
    }

    var systemImage: String {
        switch self {
        case .draft:
            "doc"
        case .planning:
            "list.bullet.clipboard"
        case .awaitingApproval:
            "person.badge.clock"
        case .running:
            "bolt.horizontal.circle"
        case .blocked:
            "exclamationmark.octagon"
        case .reviewable:
            "doc.text.magnifyingglass"
        case .failed:
            "xmark.octagon"
        case .cancelled:
            "nosign"
        case .abandoned:
            "archivebox"
        case .merged:
            "arrow.triangle.merge"
        case .archived:
            "tray.full"
        }
    }

    var tint: Color {
        switch self {
        case .draft, .archived, .abandoned:
            .secondary
        case .planning:
            .blue
        case .awaitingApproval, .blocked:
            .orange
        case .running:
            .teal
        case .reviewable:
            .indigo
        case .failed, .cancelled:
            .red
        case .merged:
            .green
        }
    }
}

extension Workspace.State {
    var displayName: String {
        switch self {
        case .active:
            "Active"
        case .offlineCache:
            "Offline cache"
        case .providerUnavailable:
            "Provider unavailable"
        case .archived:
            "Archived"
        case .policyLocked:
            "Policy locked"
        }
    }

    var systemImage: String {
        switch self {
        case .active:
            "checkmark.circle"
        case .offlineCache:
            "externaldrive.badge.icloud"
        case .providerUnavailable:
            "wifi.exclamationmark"
        case .archived:
            "archivebox"
        case .policyLocked:
            "lock.shield"
        }
    }

    var tint: Color {
        switch self {
        case .active:
            .green
        case .offlineCache:
            .teal
        case .providerUnavailable, .policyLocked:
            .orange
        case .archived:
            .secondary
        }
    }
}

extension RiskTier {
    var displayName: String {
        switch self {
        case .low:
            "Low risk"
        case .medium:
            "Medium risk"
        case .high:
            "High risk"
        case .critical:
            "Critical risk"
        }
    }

    var systemImage: String {
        switch self {
        case .low:
            "checkmark.shield"
        case .medium:
            "exclamationmark.shield"
        case .high:
            "exclamationmark.triangle"
        case .critical:
            "lock.trianglebadge.exclamationmark"
        }
    }

    var tint: Color {
        switch self {
        case .low:
            .green
        case .medium:
            .blue
        case .high:
            .orange
        case .critical:
            .red
        }
    }
}

extension ApprovalRequest.Status {
    var displayName: String {
        switch self {
        case .pending:
            "Pending"
        case .approved:
            "Approved"
        case .denied:
            "Denied"
        case .edited:
            "Edited"
        case .expired:
            "Expired"
        case .policyBlocked:
            "Policy blocked"
        }
    }

    var systemImage: String {
        switch self {
        case .pending:
            "clock.badge.exclamationmark"
        case .approved:
            "checkmark.seal"
        case .denied:
            "xmark.seal"
        case .edited:
            "pencil.and.list.clipboard"
        case .expired:
            "timer"
        case .policyBlocked:
            "lock.shield"
        }
    }

    var tint: Color {
        switch self {
        case .pending, .edited:
            .orange
        case .approved:
            .green
        case .denied, .expired, .policyBlocked:
            .red
        }
    }
}

extension ExecutionRuntimeDescriptor.Health {
    var displayName: String {
        switch self {
        case .healthy:
            "Healthy"
        case .degraded:
            "Degraded"
        case .connecting:
            "Connecting"
        case .offline:
            "Offline"
        case .asleep:
            "Asleep"
        case .unavailable:
            "Unavailable"
        case .untrusted:
            "Untrusted"
        }
    }

    var systemImage: String {
        switch self {
        case .healthy:
            "checkmark.circle"
        case .degraded:
            "speedometer"
        case .connecting:
            "antenna.radiowaves.left.and.right"
        case .offline:
            "wifi.slash"
        case .asleep:
            "moon"
        case .unavailable:
            "xmark.circle"
        case .untrusted:
            "exclamationmark.shield"
        }
    }

    var tint: Color {
        switch self {
        case .healthy:
            .green
        case .degraded, .connecting, .asleep:
            .orange
        case .offline, .unavailable, .untrusted:
            .red
        }
    }
}

extension CheckRun {
    var displayName: String {
        if let conclusion {
            "\(status.displayName), \(conclusion.displayName)"
        } else {
            status.displayName
        }
    }

    var systemImage: String {
        if status != .completed {
            return "clock.arrow.circlepath"
        }
        switch conclusion {
        case .success:
            return "checkmark.circle"
        case .failure, .timedOut, .actionRequired:
            return "xmark.octagon"
        case .cancelled, .skipped:
            return "minus.circle"
        case .neutral, .unknown, nil:
            return "questionmark.circle"
        }
    }

    var tint: Color {
        if status != .completed {
            return .blue
        }
        switch conclusion {
        case .success:
            return .green
        case .failure, .timedOut, .actionRequired:
            return .red
        case .cancelled, .skipped, .neutral, .unknown, nil:
            return .secondary
        }
    }
}

extension CheckRun.Status {
    var displayName: String {
        switch self {
        case .queued:
            "Queued"
        case .inProgress:
            "In progress"
        case .completed:
            "Completed"
        case .waiting:
            "Waiting"
        case .requested:
            "Requested"
        case .pending:
            "Pending"
        }
    }
}

extension CheckRun.Conclusion {
    var displayName: String {
        switch self {
        case .success:
            "passing"
        case .failure:
            "failing"
        case .neutral:
            "neutral"
        case .cancelled:
            "cancelled"
        case .skipped:
            "skipped"
        case .timedOut:
            "timed out"
        case .actionRequired:
            "action required"
        case .unknown:
            "unknown"
        }
    }
}

extension ReviewableArtifact.Kind {
    var displayName: String {
        switch self {
        case .plan:
            "Plan"
        case .toolCall:
            "Tool call"
        case .diff:
            "Diff"
        case .command:
            "Command"
        case .testResult:
            "Test result"
        case .preview:
            "Preview"
        case .pullRequest:
            "Pull request"
        case .checkRun:
            "Check run"
        case .log:
            "Log"
        case .auditEvent:
            "Audit event"
        }
    }

    var systemImage: String {
        switch self {
        case .plan:
            "list.bullet.clipboard"
        case .toolCall:
            "wrench.and.screwdriver"
        case .diff:
            "plus.forwardslash.minus"
        case .command:
            "terminal"
        case .testResult:
            "testtube.2"
        case .preview:
            "safari"
        case .pullRequest:
            "arrow.triangle.pull"
        case .checkRun:
            "checklist"
        case .log:
            "doc.text"
        case .auditEvent:
            "lock.doc"
        }
    }
}

extension RuntimeCapability {
    var displayName: String {
        switch self {
        case .fileRead:
            "File read"
        case .fileWrite:
            "File write"
        case .shellCommands:
            "Remote shell"
        case .buildCommands:
            "Builds"
        case .testCommands:
            "Tests"
        case .dependencyInstall:
            "Dependency installs"
        case .previews:
            "Previews"
        case .lsp:
            "Source intelligence"
        case .modelSelection:
            "Model selection"
        case .taskLifecycle:
            "Task lifecycle"
        case .streamingLogs:
            "Streaming logs"
        case .artifacts:
            "Artifacts"
        case .pullRequestWrites:
            "Pull request writes"
        case .budgetTelemetry:
            "Budget telemetry"
        case .secretHandles:
            "Secret handles"
        case .networkEgressPolicy:
            "Network policy"
        case .deployment:
            "Deployment"
        }
    }
}

extension BillingPath {
    var displayName: String {
        switch self {
        case .githubCopilotSubscription:
            "GitHub Copilot subscription"
        case .chatGPTSubscription:
            "ChatGPT subscription"
        case .claudeSubscription:
            "Claude subscription"
        case .providerAPIKey:
            "Provider API key"
        case .enterpriseContract:
            "Enterprise contract"
        case .githubActionsMinutes:
            "GitHub Actions minutes"
        case .codespacesQuota:
            "Codespaces quota"
        case .userOwnedCompute:
            "User-owned compute"
        case .freeTier:
            "Free tier"
        case .unknown:
            "Unknown"
        }
    }
}

extension ProviderKind {
    var displayName: String {
        switch self {
        case .githubCopilot:
            "GitHub Copilot"
        case .claudeCode:
            "Claude Code"
        case .openAICodex:
            "OpenAI Codex"
        case .openCode:
            "OpenCode"
        case .codespaces:
            "Codespaces"
        case .githubActions:
            "GitHub Actions"
        case .ssh:
            "SSH runtime"
        case .custom:
            "Custom provider"
        }
    }
}

extension AgentSession.Mode {
    var displayName: String {
        switch self {
        case .plan:
            "Plan"
        case .interactive:
            "Interactive"
        case .autopilot:
            "Autopilot"
        case .fleet:
            "Fleet"
        case .reviewOnly:
            "Review only"
        }
    }
}
