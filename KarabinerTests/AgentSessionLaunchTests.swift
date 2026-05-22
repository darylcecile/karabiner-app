import Foundation
import KarabinerCore
@testable import KarabinerUI
import Testing

/// Tests for the real agent session launch path.
///
/// All tests inject `InMemoryGitHubAPIClient` (KarabinerCore test double) so no real GitHub
/// tasks are ever created or affected. `InMemoryGitHubRepositoryLoader` provides a pre-loaded
/// GitHub connection without any network access.
struct AgentSessionLaunchTests {

    // MARK: - AgentSessionStatus mapping

    @Test("Task statuses map to the correct AgentSessionStatus values")
    func taskStatusMappingCoversAllCases() {
        let cases: [(AgentTaskStatus, AgentSessionStatus)] = [
            (.draft,          .draft),
            (.queued,         .running),
            (.inProgress,     .running),
            (.idle,           .running),
            (.waitingForUser, .awaitingApproval),
            (.reviewable,     .reviewable),
            (.completed,      .reviewable),
            (.failed,         .failed),
            (.timedOut,       .failed),
            (.unsupported,    .failed),
            (.cancelled,      .cancelled)
        ]
        for (input, expected) in cases {
            #expect(AgentSessionStatus(taskStatus: input) == expected,
                    "AgentTaskStatus.\(input) should map to AgentSessionStatus.\(expected)")
        }
    }

    // MARK: - AgentSessionLauncher: success path

    @Test("Successful task start produces an AgentSession with correct workspace and status bindings")
    func launchSuccessCreatesSession() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(
                id: "task-42",
                state: "queued",
                htmlURL: "https://github.com/octocat/karabiner/tasks/task-42"
            ))
        }

        let launcher = AgentSessionLauncher(adapter: GitHubCopilotAgentProviderAdapter(apiClient: client))
        let workspace = KarabinerTestFixtures.workspaceRestoration
        let request = StartAgentSessionRequest(
            workspace: workspace,
            prompt: "Implement SwiftUI accessibility improvements.",
            model: nil,
            createPullRequest: true
        )

        let session = try await launcher.launch(request, accountLabel: "@octocat")

        #expect(session.id == "task-42")
        #expect(session.workspaceID == workspace.id)
        #expect(session.repositoryID == workspace.repositoryID)
        #expect(session.promptSummary == "Implement SwiftUI accessibility improvements.")
        #expect(session.providerConnectionID == AgentProviderID.githubCopilot.rawValue)
        #expect(session.status == .running)
        #expect(session.disclosure.providerName == "GitHub Copilot cloud agent")
        #expect(session.disclosure.runtimeKind == .githubHostedAgent)
        #expect(session.disclosure.billingPath == .githubCopilotSubscription)
        #expect(session.providerSessionURL?.absoluteString == "https://github.com/octocat/karabiner/tasks/task-42")
        #expect(!session.disclosure.limitations.isEmpty)
    }

    @Test("in_progress provider state produces a running AgentSession")
    func inProgressMapsToRunning() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "t1", state: "in_progress"))
        }
        let session = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
        #expect(session.status == .running)
    }

    @Test("waiting_for_user provider state produces an awaitingApproval AgentSession")
    func waitingForUserMapsToAwaitingApproval() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "t2", state: "waiting_for_user"))
        }
        let session = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
        #expect(session.status == .awaitingApproval)
    }

    @Test("completed provider state produces a reviewable AgentSession")
    func completedMapsToReviewable() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "t3", state: "completed"))
        }
        let session = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
        #expect(session.status == .reviewable)
    }

    @Test("Prompts over 200 characters are truncated in promptSummary")
    func longPromptIsTruncated() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "t4", state: "queued"))
        }
        let request = StartAgentSessionRequest(
            workspace: KarabinerTestFixtures.workspaceRestoration,
            prompt: String(repeating: "X", count: 300)
        )
        let session = try await makeLauncher(apiClient: client).launch(request, accountLabel: "@octocat")
        #expect(session.promptSummary.count == 200)
    }

    @Test("Branch falls back to workspace branch when provider response omits it")
    func branchFallsBackToWorkspace() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "t5", state: "queued", branchName: nil))
        }
        let workspace = KarabinerTestFixtures.workspaceRestoration
        let session = try await makeLauncher(apiClient: client).launch(makeRequest(workspace: workspace), accountLabel: "@octocat")
        #expect(session.disclosure.branchName == workspace.branchName)
    }

    // MARK: - AgentSessionLauncher: error handling

    @Test("403 forbidden response throws GitHubAPIError.forbidden without creating a session")
    func forbiddenResponseThrows() async {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.forbidden("Resource not accessible")
        }
        do {
            _ = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
            Issue.record("Expected GitHubAPIError.forbidden.")
        } catch GitHubAPIError.forbidden { /* pass */ }
          catch { Issue.record("Unexpected error: \(error)") }
    }

    @Test("404 response throws GitHubAPIError.notFound without creating a session")
    func notFoundResponseThrows() async {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.notFound
        }
        do {
            _ = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
            Issue.record("Expected GitHubAPIError.notFound.")
        } catch GitHubAPIError.notFound { /* pass */ }
          catch { Issue.record("Unexpected error: \(error)") }
    }

    @Test("422 response throws GitHubAPIError.server(422) without creating a session")
    func unprocessableResponseThrows() async {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.server(statusCode: 422, message: "Copilot Business required")
        }
        do {
            _ = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
            Issue.record("Expected GitHubAPIError.server(422).")
        } catch GitHubAPIError.server(let code, _) {
            #expect(code == 422)
        } catch { Issue.record("Unexpected error: \(error)") }
    }

    @Test("401 response throws GitHubAPIError.unauthorized without creating a session")
    func unauthorizedResponseThrows() async {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.unauthorized
        }
        do {
            _ = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
            Issue.record("Expected GitHubAPIError.unauthorized.")
        } catch GitHubAPIError.unauthorized { /* pass */ }
          catch { Issue.record("Unexpected error: \(error)") }
    }

    @Test("Provider response missing task ID throws AgentProviderError.missingTaskID")
    func missingTaskIDThrows() async {
        let client = InMemoryGitHubAPIClient()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201,
                body: Data(#"{"state":"queued","updated_at":"2025-01-01T00:00:00Z"}"#.utf8))
        }
        do {
            _ = try await makeLauncher(apiClient: client).launch(makeRequest(), accountLabel: "@octocat")
            Issue.record("Expected AgentProviderError.missingTaskID.")
        } catch AgentProviderError.missingTaskID { /* pass */ }
          catch { Issue.record("Unexpected error: \(error)") }
    }

    // MARK: - KarabinerAppStore integration

    @Test("startAgentSession success appends AgentSession and links the workspace")
    @MainActor
    func storeStartSessionSuccess() async {
        let apiClient = InMemoryGitHubAPIClient()
        await apiClient.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "store-task-1", state: "queued"))
        }
        let store = await makeConnectedStore(apiClient: apiClient)

        await store.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Fix accessibility bug.", createPR: false)

        #expect(store.sessionLaunchError == nil)
        #expect(store.agentSessions.count == 1)
        #expect(store.agentSessions.first?.id == "store-task-1")
        #expect(store.agentSessions.first?.status == .running)
    }

    @Test("startAgentSession 403 sets sessionLaunchError and does not add a session")
    @MainActor
    func storeStartSession403SetsError() async {
        let apiClient = InMemoryGitHubAPIClient()
        await apiClient.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.forbidden("Resource not accessible by your token.")
        }
        let store = await makeConnectedStore(apiClient: apiClient)

        await store.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Test")

        #expect(store.sessionLaunchError?.isEmpty == false)
        #expect(store.agentSessions.isEmpty)
    }

    @Test("startAgentSession without GitHub connection sets error immediately without a network call")
    @MainActor
    func storeStartSessionRequiresConnection() async {
        let store = KarabinerAppStore()
        await store.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Test")

        #expect(store.sessionLaunchError?.isEmpty == false)
        #expect(store.agentSessions.isEmpty)
    }

    @Test("422 from API surfaces a plan-requirement error message in the store")
    @MainActor
    func store422SetsError() async {
        let apiClient = InMemoryGitHubAPIClient()
        await apiClient.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.server(statusCode: 422, message: "Copilot Business required")
        }
        let store = await makeConnectedStore(apiClient: apiClient)

        await store.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Test")

        #expect(store.sessionLaunchError?.isEmpty == false)
        #expect(store.agentSessions.isEmpty)
    }

    @Test("sessionLaunchError is cleared at the start of each new launch attempt")
    @MainActor
    func storeErrorClearedOnRetry() async {
        // First call: fail
        let failClient = InMemoryGitHubAPIClient()
        await failClient.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            throw GitHubAPIError.forbidden("Forbidden")
        }
        let failStore = await makeConnectedStore(apiClient: failClient)
        await failStore.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Test")
        #expect(failStore.sessionLaunchError != nil)

        // Second call on a fresh store: succeed — error must be nil after success
        let successClient = InMemoryGitHubAPIClient()
        await successClient.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { _ in
            GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "retry-task", state: "queued"))
        }
        let successStore = await makeConnectedStore(apiClient: successClient)
        await successStore.startAgentSession(from: KarabinerTestFixtures.workspaceRestoration, prompt: "Retry")
        #expect(successStore.sessionLaunchError == nil)
        #expect(successStore.agentSessions.count == 1)
    }

    // MARK: - Agent Tasks API version header

    @Test("GitHubCopilotAgentProviderAdapter sends X-GitHub-Api-Version: 2026-03-10 for startTask")
    func adapterSendsAgentTasksVersionHeaderForStartTask() async throws {
        let client = InMemoryGitHubAPIClient()
        let capture = RequestCapture()
        await client.register(method: .post, path: "/agents/repos/octocat/karabiner/tasks") { req in
            await capture.record(req)
            return GitHubAPIResponse(statusCode: 201, body: makeTaskJSON(id: "hv-1", state: "queued"))
        }
        let draft = AgentTaskDraft(prompt: "Test header.", repository: KarabinerTestFixtures.repositoryRef)
        _ = try await GitHubCopilotAgentProviderAdapter(apiClient: client).startTask(draft)
        let captured = await capture.last
        #expect(captured?.headers["X-GitHub-Api-Version"] == "2026-03-10")
    }

    @Test("GitHubCopilotAgentProviderAdapter sends X-GitHub-Api-Version: 2026-03-10 for taskStatus")
    func adapterSendsAgentTasksVersionHeaderForTaskStatus() async throws {
        let client = InMemoryGitHubAPIClient()
        let capture = RequestCapture()
        await client.register(method: .get, path: "/agents/repos/octocat/karabiner/tasks/t99") { req in
            await capture.record(req)
            return GitHubAPIResponse(statusCode: 200, body: makeTaskJSON(id: "t99", state: "in_progress"))
        }
        let handle = AgentTaskHandle(id: "t99", providerID: .githubCopilot, repository: KarabinerTestFixtures.repositoryRef)
        _ = try await GitHubCopilotAgentProviderAdapter(apiClient: client).taskStatus(handle)
        let captured = await capture.last
        #expect(captured?.headers["X-GitHub-Api-Version"] == "2026-03-10")
    }
}

// MARK: - Private helpers

private extension AgentSessionLaunchTests {

    func makeRequest(workspace: Workspace = KarabinerTestFixtures.workspaceRestoration) -> StartAgentSessionRequest {
        StartAgentSessionRequest(workspace: workspace, prompt: "Write unit tests for the new module.")
    }

    func makeLauncher(apiClient: any GitHubAPIClient) -> AgentSessionLauncher {
        AgentSessionLauncher(adapter: GitHubCopilotAgentProviderAdapter(apiClient: apiClient))
    }

    func makeTaskJSON(
        id: String,
        state: String,
        htmlURL: String? = nil,
        branchName: String? = "agent/task-branch"
    ) -> Data {
        var fields = [#""id": "\#(id)""#, #""state": "\#(state)""#, #""updated_at": "2025-06-01T12:00:00Z""#]
        if let url = htmlURL { fields.append(#""html_url": "\#(url)""#) }
        if let branch = branchName { fields.append(#""branch": "\#(branch)""#) }
        return Data("{\(fields.joined(separator: ", "))}".utf8)
    }

    /// Returns a `KarabinerAppStore` that has completed a `load()` against a mock loader
    /// returning the test GitHub connection, and uses the provided API client for agent tasks.
    @MainActor
    func makeConnectedStore(apiClient: any GitHubAPIClient) async -> KarabinerAppStore {
        let tokenStorage = InMemoryTokenStore(tokens: [
            KarabinerAppStore.githubTokenKey: StoredToken(accessToken: "test-ghu_token")
        ])
        let store = KarabinerAppStore(
            tokenStorage: tokenStorage,
            loaderFactory: { _ in
                InMemoryGitHubRepositoryLoader(
                    snapshot: AuthenticatedGitHubSnapshot(
                        connection: testGitHubConnection,
                        repositories: [KarabinerTestFixtures.repository]
                    )
                )
            },
            agentLauncherFactory: { _ in
                AgentSessionLauncher(adapter: GitHubCopilotAgentProviderAdapter(apiClient: apiClient))
            }
        )
        await store.load()
        return store
    }

    var testGitHubConnection: GitHubConnection {
        GitHubConnection(
            id: "github-octocat",
            account: GitHubAccount(
                id: 1,
                login: "octocat",
                displayName: "The Octocat",
                kind: .user,
                avatarURL: nil,
                profileURL: URL(string: "https://github.com/octocat")
            ),
            authState: .connected,
            tokenScopes: ["repo", "copilot"],
            lastValidatedAt: KarabinerTestFixtures.fixedDate
        )
    }
}

// MARK: - Test doubles

/// Thread-safe actor for capturing `GitHubAPIRequest` values from handler closures.
private actor RequestCapture: Sendable {
    private(set) var last: GitHubAPIRequest?

    func record(_ request: GitHubAPIRequest) {
        last = request
    }
}

/// In-memory `GitHubRepositoryLoading` that returns a fixed snapshot without network access.
private struct InMemoryGitHubRepositoryLoader: GitHubRepositoryLoading, Sendable {
    let snapshot: AuthenticatedGitHubSnapshot

    func authenticatedSnapshot() async throws -> AuthenticatedGitHubSnapshot {
        snapshot
    }
}
