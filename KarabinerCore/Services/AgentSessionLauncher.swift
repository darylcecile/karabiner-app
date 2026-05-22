import Foundation

// MARK: - Protocol

/// Launches a real provider agent session from a `StartAgentSessionRequest`.
///
/// Implementations call an `AgentProviderAdapter`, map the `AgentTaskSnapshot` response to a
/// concrete `AgentSession`, and surface honest provider/API errors — never fake session data.
public protocol AgentSessionLaunching: Sendable {
    /// Starts a provider task and returns the resulting `AgentSession`.
    ///
    /// - Parameters:
    ///   - request: The validated launch request containing workspace, prompt, and options.
    ///   - accountLabel: Display label for the authenticated GitHub account (e.g. `"@octocat"`).
    /// - Returns: A real `AgentSession` mapped from the provider response.
    /// - Throws: `AgentProviderError` or `GitHubAPIError` on failure. No session is created if
    ///           an error is thrown.
    func launch(_ request: StartAgentSessionRequest, accountLabel: String) async throws -> AgentSession
}

// MARK: - Default implementation

/// Core service that bridges `StartAgentSessionRequest` → `AgentProviderAdapter` → `AgentSession`.
///
/// Only `GitHubCopilotAgentProviderAdapter` is wired up by default; the `adapter` property is
/// injectable so tests can substitute `InMemoryAgentProviderAdapter`.
public struct AgentSessionLauncher: AgentSessionLaunching, Sendable {
    public let adapter: any AgentProviderAdapter

    public init(adapter: any AgentProviderAdapter) {
        self.adapter = adapter
    }

    public func launch(_ request: StartAgentSessionRequest, accountLabel: String) async throws -> AgentSession {
        let repoRef = repositoryRef(from: request.workspace)
        let draft = AgentTaskDraft(
            prompt: request.prompt,
            repository: repoRef,
            baseRef: request.baseRef ?? request.workspace.baseBranchName ?? request.workspace.branchName,
            model: request.model,
            createPullRequest: request.createPullRequest
        )
        let snapshot = try await adapter.startTask(draft)
        return agentSession(from: snapshot, request: request, accountLabel: accountLabel)
    }

    // MARK: - Private helpers

    private func repositoryRef(from workspace: Workspace) -> RepositoryRef {
        let parts = workspace.repositoryFullName.split(separator: "/", maxSplits: 1)
        let owner = parts.count >= 1 ? String(parts[0]) : ""
        let name = parts.count >= 2 ? String(parts[1]) : ""
        return RepositoryRef(owner: owner, name: name, defaultBranch: workspace.branchName)
    }

    private func agentSession(
        from snapshot: AgentTaskSnapshot,
        request: StartAgentSessionRequest,
        accountLabel: String
    ) -> AgentSession {
        let now = Date()
        let branchName = snapshot.branchName ?? request.workspace.branchName

        let disclosure = AgentSessionDisclosure(
            providerName: "GitHub Copilot cloud agent",
            providerKind: .githubCopilot,
            runtimeName: "GitHub-hosted cloud agent",
            runtimeKind: .githubHostedAgent,
            accountLabel: accountLabel,
            billingPath: .githubCopilotSubscription,
            branchName: branchName,
            lifecycleSupport: .taskAPI,
            streamingSupport: .pollingOnly,
            apiLimits: APILimits(
                precision: .estimated,
                notes: ["Agent Tasks API limits depend on Copilot plan and organization policy."]
            ),
            limitations: [
                "Agent Tasks API is in public preview. Availability requires Copilot Business or Enterprise.",
                "Task work executes in GitHub-hosted cloud environments, not inside the iPad app."
            ]
        )

        return AgentSession(
            id: snapshot.id,
            workspaceID: request.workspace.id,
            repositoryID: request.workspace.repositoryID,
            promptSummary: String(request.prompt.prefix(200)),
            providerConnectionID: adapter.id.rawValue,
            runtimeID: "github-hosted-agent",
            modelName: request.model,
            mode: request.mode,
            status: AgentSessionStatus(taskStatus: snapshot.status),
            disclosure: disclosure,
            createdAt: now,
            updatedAt: snapshot.updatedAt,
            providerSessionURL: snapshot.handle.links.first?.url,
            reviewArtifactIDs: []
        )
    }
}

// MARK: - AgentSessionStatus mapping

extension AgentSessionStatus {
    /// Maps a provider `AgentTaskStatus` to the app's `AgentSessionStatus`.
    public init(taskStatus: AgentTaskStatus) {
        switch taskStatus {
        case .draft:
            self = .draft
        case .queued, .inProgress, .idle:
            self = .running
        case .waitingForUser:
            self = .awaitingApproval
        case .reviewable, .completed:
            self = .reviewable
        case .failed, .timedOut, .unsupported:
            self = .failed
        case .cancelled:
            self = .cancelled
        }
    }
}
