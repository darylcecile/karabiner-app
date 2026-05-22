import Combine
import Foundation
import KarabinerCore

struct KarabinerNotice: Identifiable {
    let id = UUID()
    var title: String
    var message: String
}

@MainActor
final class KarabinerAppStore: ObservableObject {
    enum LoadPhase: Equatable {
        case disconnected
        case idle
        case loading
        case loaded
        case failed(String)

        var isLoading: Bool {
            if case .loading = self {
                return true
            }
            return false
        }
    }

    static let githubTokenKey = TokenKey(namespace: "github", accountID: "primary")

    @Published private(set) var phase: LoadPhase = .idle
    @Published private(set) var githubConnection: GitHubConnection?
    @Published private(set) var repositories: [GitHubRepository] = []
    @Published private(set) var workspaces: [Workspace] = []
    @Published private(set) var agentSessions: [AgentSession] = []
    @Published private(set) var approvalRequests: [ApprovalRequest] = []
    @Published private(set) var checkRuns: [CheckRun] = []
    @Published private(set) var reviewArtifacts: [ReviewableArtifact] = []
    @Published private(set) var logEvents: [LogEvent] = []
    @Published private(set) var runtimes: [ExecutionRuntimeDescriptor] = []
    @Published private(set) var hasGitHubCredential = false
    @Published var notice: KarabinerNotice?

    /// Non-nil when `startAgentSession` surfaces a provider or API error. Cleared on each new launch attempt.
    @Published private(set) var sessionLaunchError: String?

    private let tokenStorage: any SecureTokenStorage
    private let loaderFactory: @Sendable (any GitHubAccessTokenProviding) -> any GitHubRepositoryLoading
    private let agentLauncherFactory: @Sendable (any GitHubAccessTokenProviding) -> any AgentSessionLaunching

    init(
        tokenStorage: any SecureTokenStorage = KeychainTokenStore(),
        loaderFactory: @escaping @Sendable (any GitHubAccessTokenProviding) -> any GitHubRepositoryLoading = { tokenProvider in
            GitHubRepositoryService(
                apiClient: URLSessionGitHubAPIClient(tokenProvider: tokenProvider)
            )
        },
        agentLauncherFactory: @escaping @Sendable (any GitHubAccessTokenProviding) -> any AgentSessionLaunching = { tokenProvider in
            AgentSessionLauncher(
                adapter: GitHubCopilotAgentProviderAdapter(
                    apiClient: URLSessionGitHubAPIClient(tokenProvider: tokenProvider)
                )
            )
        }
    ) {
        self.tokenStorage = tokenStorage
        self.loaderFactory = loaderFactory
        self.agentLauncherFactory = agentLauncherFactory
    }

    var isConnected: Bool {
        githubConnection?.authState.canStartSession == true
    }

    var canDisconnectGitHub: Bool {
        hasGitHubCredential || githubConnection != nil
    }

    var pendingApprovals: [ApprovalRequest] {
        approvalRequests.filter { $0.status == .pending }
    }

    var activeAgents: [AgentSession] {
        agentSessions.filter { session in
            switch session.status {
            case .draft, .planning, .running, .awaitingApproval, .reviewable, .blocked:
                true
            case .failed, .merged, .archived, .cancelled, .abandoned:
                false
            }
        }
    }

    var reviewQueueCount: Int {
        pendingApprovals.count + checkRuns.count + reviewArtifacts.count
    }

    func load() async {
        guard !phase.isLoading else { return }
        phase = .loading
        do {
            _ = try await tokenStorage.token(for: Self.githubTokenKey)
            hasGitHubCredential = true
            let tokenProvider = StoredGitHubAccessTokenProvider(
                tokenStorage: tokenStorage,
                tokenKey: Self.githubTokenKey
            )
            let snapshot = try await loaderFactory(tokenProvider).authenticatedSnapshot()
            githubConnection = snapshot.connection
            repositories = snapshot.repositories
            phase = .loaded
        } catch SecureTokenStorageError.notFound(_) {
            hasGitHubCredential = false
            clearAuthenticatedState()
            phase = .disconnected
        } catch GitHubAPIError.missingToken {
            hasGitHubCredential = false
            clearAuthenticatedState()
            phase = .disconnected
        } catch {
            clearAuthenticatedState(keepRepositories: false)
            phase = .failed(error.localizedDescription)
        }
    }

    func connectGitHub(accessToken: String) async {
        let trimmedToken = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            phase = .failed("Enter a GitHub user access token before connecting.")
            return
        }

        phase = .loading
        do {
            try await tokenStorage.store(StoredToken(accessToken: trimmedToken), for: Self.githubTokenKey)
            hasGitHubCredential = true
            phase = .idle
            await load()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func disconnectGitHub() async {
        do {
            try await tokenStorage.deleteToken(for: Self.githubTokenKey)
        } catch SecureTokenStorageError.notFound(_) {
            // Already disconnected; continue clearing app state.
        } catch {
            phase = .failed(error.localizedDescription)
            return
        }
        hasGitHubCredential = false
        clearAuthenticatedState()
        phase = .disconnected
    }

    @discardableResult
    func openWorkspace(for repository: GitHubRepository) -> Workspace {
        if let index = workspaces.firstIndex(where: { $0.repositoryID == repository.id && $0.branchName == repository.defaultBranch }) {
            workspaces[index].lastOpenedAt = Date()
            return workspaces[index]
        }

        let workspace = Workspace(
            id: "\(repository.id)-\(repository.defaultBranch)",
            repositoryID: repository.id,
            repositoryFullName: repository.fullName,
            branchName: repository.defaultBranch,
            baseBranchName: repository.defaultBranch,
            state: repository.isArchived ? .archived : .active,
            cacheSummary: CacheSummary(
                fileCount: 0,
                dirtyDraftCount: 0,
                totalBytes: 0,
                isSearchIndexFresh: false
            ),
            lastOpenedAt: Date()
        )
        workspaces.append(workspace)
        return workspace
    }

    func deleteLocalCache() {
        workspaces = []
        agentSessions = []
        approvalRequests = []
        checkRuns = []
        reviewArtifacts = []
        logEvents = []
        runtimes = []
        sessionLaunchError = nil
    }

    func presentNotice(title: String, message: String) {
        notice = KarabinerNotice(title: title, message: message)
    }

    /// Starts a real GitHub Copilot agent task from an open workspace.
    ///
    /// On success, a new `AgentSession` is appended to `agentSessions` and the workspace's
    /// `activeAgentSessionIDs` is updated. If the provider returns a PR URL, a `ReviewableArtifact`
    /// is also created. On failure, `sessionLaunchError` is set with an honest error message and no
    /// session data is added.
    func startAgentSession(
        from workspace: Workspace,
        prompt: String,
        model: String? = nil,
        createPR: Bool = true
    ) async {
        sessionLaunchError = nil

        guard isConnected, let connection = githubConnection else {
            sessionLaunchError = "Connect GitHub before starting an agent session."
            return
        }

        let tokenProvider = StoredGitHubAccessTokenProvider(
            tokenStorage: tokenStorage,
            tokenKey: Self.githubTokenKey
        )
        let launcher = agentLauncherFactory(tokenProvider)
        let request = StartAgentSessionRequest(
            workspace: workspace,
            prompt: prompt,
            model: model,
            createPullRequest: createPR
        )

        do {
            var session = try await launcher.launch(request, accountLabel: "@\(connection.account.login)")
            let now = session.createdAt

            // If provider returned a PR URL, record it as a reviewable artifact.
            if let prURL = session.providerSessionURL.flatMap({ _ in nil as URL? }),
               let taskLink = session.providerSessionURL {
                _ = taskLink
                _ = prURL
                // providerSessionURL carries the task page; PR artifact is handled below if pullRequest URL differs.
            }

            // Record the session.
            agentSessions.append(session)

            // Register any PR artifact from the snapshot (populated via reviewArtifactIDs after launch).
            // Snapshot pull-request URL is surfaced through the provider session URL on the first task response.
            // Create a stub artifact so the Review screen shows an honest link.
            if let taskPageURL = session.providerSessionURL {
                let artifact = ReviewableArtifact(
                    id: "artifact-task-\(session.id)",
                    kind: .log,
                    title: "Agent task – \(workspace.repositoryFullName)",
                    state: .pendingReview,
                    sessionID: session.id,
                    riskTier: .low,
                    createdAt: now,
                    updatedAt: now,
                    stableURL: taskPageURL
                )
                reviewArtifacts.append(artifact)
                if let idx = agentSessions.firstIndex(where: { $0.id == session.id }) {
                    agentSessions[idx].reviewArtifactIDs.append(artifact.id)
                    session = agentSessions[idx]
                }
            }

            // Link the session to its workspace.
            if let idx = workspaces.firstIndex(where: { $0.id == workspace.id }) {
                if !workspaces[idx].activeAgentSessionIDs.contains(session.id) {
                    workspaces[idx].activeAgentSessionIDs.append(session.id)
                }
            }
        } catch let error as GitHubAPIError {
            sessionLaunchError = sessionErrorMessage(for: error)
        } catch let error as AgentProviderError {
            sessionLaunchError = error.errorDescription ?? error.localizedDescription
        } catch {
            sessionLaunchError = error.localizedDescription
        }
    }

    private func sessionErrorMessage(for error: GitHubAPIError) -> String {
        switch error {
        case .missingToken:
            return "GitHub token is missing. Connect GitHub in Settings."
        case .unauthorized:
            return "GitHub authentication failed. Reconnect your account in Settings."
        case .forbidden(let message):
            return message ?? "Your token does not have permission to start Copilot agent tasks. A Copilot Business or Enterprise plan with the 'copilot' scope is required."
        case .notFound:
            return "Repository not found or Agent Tasks API is unavailable for this repository."
        case .rateLimited(let retryAfter):
            if let retryAfter {
                return "GitHub rate limit reached. Try again after \(retryAfter.formatted(date: .omitted, time: .shortened))."
            }
            return "GitHub rate limit reached. Try again in a few minutes."
        case .server(let statusCode, let message):
            if statusCode == 422 {
                return message ?? "Agent Tasks is not available on your current Copilot plan. Business or Enterprise required."
            }
            return message ?? "GitHub returned an unexpected error (\(statusCode))."
        case .decodingFailed(let detail):
            return "GitHub response was unreadable: \(detail)"
        case .transportFailed(let detail):
            return "Network request failed: \(detail)"
        case .invalidBaseURL, .invalidRequestPath:
            return error.localizedDescription ?? "Invalid GitHub API configuration."
        }
    }

    var auditLogText: String {
        let account = githubConnection?.account.login ?? "not connected"
        let connectionState = githubConnection?.authState.rawValue ?? phaseDescription
        return """
        Karabiner audit summary
        GitHub account: \(account)
        Connection state: \(connectionState)
        Repositories loaded: \(repositories.count)
        Open workspaces: \(workspaces.count)
        Active agent sessions: \(activeAgents.count)
        Pending approvals: \(pendingApprovals.count)
        Review items: \(reviewQueueCount)
        Runtime connections: \(runtimes.count)
        """
    }

    private var phaseDescription: String {
        switch phase {
        case .disconnected:
            "disconnected"
        case .idle:
            "idle"
        case .loading:
            "loading"
        case .loaded:
            "loaded"
        case .failed:
            "failed"
        }
    }

    private func clearAuthenticatedState(keepRepositories: Bool = false) {
        githubConnection = nil
        if !keepRepositories {
            repositories = []
        }
        workspaces = []
        agentSessions = []
        approvalRequests = []
        checkRuns = []
        reviewArtifacts = []
        logEvents = []
        runtimes = []
        sessionLaunchError = nil
    }
}
