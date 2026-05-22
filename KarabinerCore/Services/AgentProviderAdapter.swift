import Foundation

public struct AgentProviderID: RawRepresentable, Codable, Hashable, Sendable, ExpressibleByStringLiteral {
    public var rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(stringLiteral value: String) {
        self.rawValue = value
    }

    public static let githubCopilot: AgentProviderID = "github-copilot"
    public static let claude: AgentProviderID = "claude"
    public static let codex: AgentProviderID = "codex"
    public static let openCode: AgentProviderID = "opencode"
}

public enum AgentProviderKind: String, Codable, Hashable, Sendable {
    case githubCopilotCloud
    case claudeCodeWeb
    case claudeRemoteControl
    case codexCloud
    case codexRemoteRuntime
    case openCodeGitHubAction
    case openCodeServer
    case codespaces
    case userOwnedRemoteRuntime
    case deepLinkOnly
}

public enum AgentAuthenticationKind: String, Codable, Hashable, Sendable {
    case githubUserToServerOAuth
    case providerOAuth
    case deviceCode
    case apiKeyReference
    case remoteRuntimeCredential
    case none
}

public enum AgentExecutionEnvironment: String, Codable, Hashable, Sendable {
    case providerCloud
    case githubHosted
    case githubActions
    case codespace
    case userOwnedRemote
    case onDeviceControlPlaneOnly
}

public enum AgentLifecycleCapability: String, Codable, Hashable, Sendable, CaseIterable {
    case startTask
    case listTasks
    case inspectTask
    case cancelTask
    case steerTask
    case pollStatus
    case deepLinkFallback
}

public enum AgentStreamingCapability: String, Codable, Hashable, Sendable, CaseIterable {
    case none
    case polling
    case transcript
    case logs
    case toolCalls
    case serverSentEvents
    case webSocket
}

public enum BillingVisibility: String, Codable, Hashable, Sendable {
    case none
    case planOnly
    case requestEstimate
    case tokenEstimate
    case exactCost
}

public struct ProviderLimit: Codable, Hashable, Sendable {
    public var title: String
    public var detail: String

    public init(title: String, detail: String) {
        self.title = title
        self.detail = detail
    }
}

public struct AgentProviderCapabilities: Codable, Hashable, Sendable {
    public var providerID: AgentProviderID
    public var displayName: String
    public var kind: AgentProviderKind
    public var authentication: AgentAuthenticationKind
    public var executionEnvironment: AgentExecutionEnvironment
    public var lifecycle: Set<AgentLifecycleCapability>
    public var streaming: Set<AgentStreamingCapability>
    public var billingVisibility: BillingVisibility
    public var limits: [ProviderLimit]
    public var supportsPullRequestWrites: Bool
    public var supportsSecretsAccess: Bool
    public var supportsLocalProcessExecution: Bool
    public var fallbackDeepLink: URL?

    public init(
        providerID: AgentProviderID,
        displayName: String,
        kind: AgentProviderKind,
        authentication: AgentAuthenticationKind,
        executionEnvironment: AgentExecutionEnvironment,
        lifecycle: Set<AgentLifecycleCapability>,
        streaming: Set<AgentStreamingCapability>,
        billingVisibility: BillingVisibility,
        limits: [ProviderLimit] = [],
        supportsPullRequestWrites: Bool,
        supportsSecretsAccess: Bool,
        supportsLocalProcessExecution: Bool = false,
        fallbackDeepLink: URL? = nil
    ) {
        self.providerID = providerID
        self.displayName = displayName
        self.kind = kind
        self.authentication = authentication
        self.executionEnvironment = executionEnvironment
        self.lifecycle = lifecycle
        self.streaming = streaming
        self.billingVisibility = billingVisibility
        self.limits = limits
        self.supportsPullRequestWrites = supportsPullRequestWrites
        self.supportsSecretsAccess = supportsSecretsAccess
        self.supportsLocalProcessExecution = supportsLocalProcessExecution
        self.fallbackDeepLink = fallbackDeepLink
    }
}

public struct AgentBudget: Codable, Hashable, Sendable {
    public var requestLimit: Int?
    public var tokenLimit: Int?
    public var costLimitCents: Int?

    public init(requestLimit: Int? = nil, tokenLimit: Int? = nil, costLimitCents: Int? = nil) {
        self.requestLimit = requestLimit
        self.tokenLimit = tokenLimit
        self.costLimitCents = costLimitCents
    }
}

public struct AgentContextItem: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, Hashable, Sendable {
        case file
        case folder
        case issue
        case pullRequest
        case checkRun
        case log
        case webURL
        case note
    }

    public var id: String
    public var kind: Kind
    public var title: String
    public var value: String

    public init(id: String, kind: Kind, title: String, value: String) {
        self.id = id
        self.kind = kind
        self.title = title
        self.value = value
    }
}

public struct AgentTaskDraft: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var prompt: String
    public var repository: RepositoryRef
    public var baseRef: String?
    public var mode: String?
    public var model: String?
    public var runtimeID: String?
    public var context: [AgentContextItem]
    public var budget: AgentBudget?
    public var createPullRequest: Bool
    public var metadata: [String: String]

    public init(
        id: UUID = UUID(),
        prompt: String,
        repository: RepositoryRef,
        baseRef: String? = nil,
        mode: String? = nil,
        model: String? = nil,
        runtimeID: String? = nil,
        context: [AgentContextItem] = [],
        budget: AgentBudget? = nil,
        createPullRequest: Bool = true,
        metadata: [String: String] = [:]
    ) {
        self.id = id
        self.prompt = prompt
        self.repository = repository
        self.baseRef = baseRef
        self.mode = mode
        self.model = model
        self.runtimeID = runtimeID
        self.context = context
        self.budget = budget
        self.createPullRequest = createPullRequest
        self.metadata = metadata
    }
}

public struct AgentTaskHandle: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var providerID: AgentProviderID
    public var repository: RepositoryRef?
    public var links: [WebLink]
    public var metadata: [String: String]

    public init(
        id: String,
        providerID: AgentProviderID,
        repository: RepositoryRef? = nil,
        links: [WebLink] = [],
        metadata: [String: String] = [:]
    ) {
        self.id = id
        self.providerID = providerID
        self.repository = repository
        self.links = links
        self.metadata = metadata
    }
}

public enum AgentTaskStatus: String, Codable, Hashable, Sendable {
    case draft
    case queued
    case inProgress
    case idle
    case waitingForUser
    case reviewable
    case completed
    case failed
    case timedOut
    case cancelled
    case unsupported
}

public enum AgentTaskLifecycleStage: String, Codable, Hashable, Sendable {
    case draft
    case started
    case running
    case reviewable
    case closed
}

public struct AgentTaskSnapshot: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var handle: AgentTaskHandle
    public var status: AgentTaskStatus
    public var lifecycleStage: AgentTaskLifecycleStage
    public var branchName: String?
    public var pullRequestURL: URL?
    public var progressSummary: String?
    public var updatedAt: Date
    public var metadata: [String: String]

    public init(
        id: String,
        handle: AgentTaskHandle,
        status: AgentTaskStatus,
        lifecycleStage: AgentTaskLifecycleStage,
        branchName: String? = nil,
        pullRequestURL: URL? = nil,
        progressSummary: String? = nil,
        updatedAt: Date = Date(),
        metadata: [String: String] = [:]
    ) {
        self.id = id
        self.handle = handle
        self.status = status
        self.lifecycleStage = lifecycleStage
        self.branchName = branchName
        self.pullRequestURL = pullRequestURL
        self.progressSummary = progressSummary
        self.updatedAt = updatedAt
        self.metadata = metadata
    }
}

public struct AgentTaskEvent: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, Hashable, Sendable {
        case status
        case transcript
        case log
        case approvalNeeded
        case link
        case error
    }

    public var id: UUID
    public var taskID: String
    public var kind: Kind
    public var message: String
    public var link: URL?
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        taskID: String,
        kind: Kind,
        message: String,
        link: URL? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.taskID = taskID
        self.kind = kind
        self.message = message
        self.link = link
        self.createdAt = createdAt
    }
}

public enum AgentProviderError: Error, LocalizedError, Equatable, Sendable {
    case unsupportedCapability(provider: AgentProviderID, capability: AgentLifecycleCapability)
    case missingRepository
    case missingTaskID
    case unsupportedPlan(String)
    case malformedProviderResponse(String)
    case taskNotFound(String)

    public var errorDescription: String? {
        switch self {
        case .unsupportedCapability(let provider, let capability):
            "\(provider.rawValue) does not support \(capability.rawValue)."
        case .missingRepository:
            "Provider task requires a repository."
        case .missingTaskID:
            "Provider response did not include a task identifier."
        case .unsupportedPlan(let message):
            message
        case .malformedProviderResponse(let message):
            "Malformed provider response: \(message)"
        case .taskNotFound(let id):
            "Provider task \(id) was not found."
        }
    }
}

public protocol AgentProviderAdapter: Sendable {
    var id: AgentProviderID { get }

    func capabilities() async -> AgentProviderCapabilities
    func startTask(_ draft: AgentTaskDraft) async throws -> AgentTaskSnapshot
    func taskStatus(_ handle: AgentTaskHandle) async throws -> AgentTaskSnapshot
    func listTasks(repository: RepositoryRef?) async throws -> [AgentTaskSnapshot]
    func events(for handle: AgentTaskHandle) -> AsyncThrowingStream<AgentTaskEvent, Error>
    func cancelTask(_ handle: AgentTaskHandle) async throws
    func deepLink(for draft: AgentTaskDraft) async -> URL?
}

public struct DeepLinkAgentProviderAdapter: AgentProviderAdapter, Sendable {
    public var id: AgentProviderID
    public var manifest: AgentProviderCapabilities
    public var makeDeepLink: @Sendable (AgentTaskDraft) -> URL?

    public init(
        id: AgentProviderID,
        manifest: AgentProviderCapabilities,
        makeDeepLink: @escaping @Sendable (AgentTaskDraft) -> URL?
    ) {
        self.id = id
        self.manifest = manifest
        self.makeDeepLink = makeDeepLink
    }

    public func capabilities() async -> AgentProviderCapabilities {
        manifest
    }

    public func startTask(_ draft: AgentTaskDraft) async throws -> AgentTaskSnapshot {
        throw AgentProviderError.unsupportedCapability(provider: id, capability: .startTask)
    }

    public func taskStatus(_ handle: AgentTaskHandle) async throws -> AgentTaskSnapshot {
        throw AgentProviderError.unsupportedCapability(provider: id, capability: .inspectTask)
    }

    public func listTasks(repository: RepositoryRef?) async throws -> [AgentTaskSnapshot] {
        throw AgentProviderError.unsupportedCapability(provider: id, capability: .listTasks)
    }

    public func events(for handle: AgentTaskHandle) -> AsyncThrowingStream<AgentTaskEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(AgentTaskEvent(taskID: handle.id, kind: .status, message: "Open the provider deep link to continue."))
            continuation.finish()
        }
    }

    public func cancelTask(_ handle: AgentTaskHandle) async throws {
        throw AgentProviderError.unsupportedCapability(provider: id, capability: .cancelTask)
    }

    public func deepLink(for draft: AgentTaskDraft) async -> URL? {
        makeDeepLink(draft)
    }
}

public actor InMemoryAgentProviderAdapter: AgentProviderAdapter {
    public nonisolated let id: AgentProviderID
    private let manifest: AgentProviderCapabilities
    private var tasks: [String: AgentTaskSnapshot] = [:]

    public init(id: AgentProviderID, manifest: AgentProviderCapabilities) {
        self.id = id
        self.manifest = manifest
    }

    public func capabilities() async -> AgentProviderCapabilities {
        manifest
    }

    public func startTask(_ draft: AgentTaskDraft) async throws -> AgentTaskSnapshot {
        let taskID = UUID().uuidString
        let handle = AgentTaskHandle(id: taskID, providerID: id, repository: draft.repository)
        let snapshot = AgentTaskSnapshot(
            id: taskID,
            handle: handle,
            status: .queued,
            lifecycleStage: .started,
            progressSummary: "Queued in in-memory provider."
        )
        tasks[taskID] = snapshot
        return snapshot
    }

    public func taskStatus(_ handle: AgentTaskHandle) async throws -> AgentTaskSnapshot {
        guard let snapshot = tasks[handle.id] else {
            throw AgentProviderError.taskNotFound(handle.id)
        }
        return snapshot
    }

    public func listTasks(repository: RepositoryRef?) async throws -> [AgentTaskSnapshot] {
        tasks.values.filter { snapshot in
            guard let repository else { return true }
            return snapshot.handle.repository == repository
        }
        .sorted { $0.updatedAt > $1.updatedAt }
    }

    public nonisolated func events(for handle: AgentTaskHandle) -> AsyncThrowingStream<AgentTaskEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(AgentTaskEvent(taskID: handle.id, kind: .status, message: "In-memory provider has no live stream."))
            continuation.finish()
        }
    }

    public func cancelTask(_ handle: AgentTaskHandle) async throws {
        guard var snapshot = tasks[handle.id] else {
            throw AgentProviderError.taskNotFound(handle.id)
        }
        snapshot.status = .cancelled
        snapshot.lifecycleStage = .closed
        snapshot.updatedAt = Date()
        tasks[handle.id] = snapshot
    }

    public func deepLink(for draft: AgentTaskDraft) async -> URL? {
        manifest.fallbackDeepLink
    }
}

public struct GitHubCopilotAgentProviderAdapter: AgentProviderAdapter, Sendable {
    public let id: AgentProviderID = .githubCopilot

    private let apiClient: any GitHubAPIClient
    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder
    private let webBaseURL: URL

    // Agent Tasks API is in public preview; requires this version to unlock the endpoints.
    private static let agentTasksAPIVersion = "2026-03-10"
    private static let agentTasksVersionHeader: [String: String] = [
        "X-GitHub-Api-Version": agentTasksAPIVersion
    ]

    public init(
        apiClient: any GitHubAPIClient,
        webBaseURL: URL = URL(string: "https://github.com")!
    ) {
        self.apiClient = apiClient
        self.jsonEncoder = JSONEncoder()
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.jsonDecoder = decoder
        self.webBaseURL = webBaseURL
    }

    public func capabilities() async -> AgentProviderCapabilities {
        AgentProviderCapabilities(
            providerID: id,
            displayName: "GitHub Copilot cloud agent",
            kind: .githubCopilotCloud,
            authentication: .githubUserToServerOAuth,
            executionEnvironment: .githubHosted,
            lifecycle: [.startTask, .listTasks, .inspectTask, .pollStatus, .deepLinkFallback],
            streaming: [.polling],
            billingVisibility: .planOnly,
            limits: [
                ProviderLimit(
                    title: "Public preview availability",
                    detail: "Agent Tasks API currently requires Copilot Business or Enterprise and user-to-server tokens. Pro/Pro+ and server-to-server installation tokens are not supported yet."
                ),
                ProviderLimit(
                    title: "No local execution",
                    detail: "Task work runs in GitHub-hosted cloud agent environments, not inside the iPad app."
                )
            ],
            supportsPullRequestWrites: true,
            supportsSecretsAccess: false,
            supportsLocalProcessExecution: false,
            fallbackDeepLink: webBaseURL
        )
    }

    public func startTask(_ draft: AgentTaskDraft) async throws -> AgentTaskSnapshot {
        let path = "/agents/repos/\(escape(draft.repository.owner))/\(escape(draft.repository.name))/tasks"
        let body = GitHubStartTaskRequest(
            prompt: draft.prompt,
            baseRef: draft.baseRef,
            model: draft.model,
            createPullRequest: draft.createPullRequest
        )
        let response = try await apiClient.send(
            GitHubAPIRequest(
                method: .post,
                path: path,
                headers: Self.agentTasksVersionHeader,
                body: try jsonEncoder.encode(body)
            )
        )
        let dto = try decodeTask(from: response)
        return try snapshot(from: dto, repository: draft.repository)
    }

    public func taskStatus(_ handle: AgentTaskHandle) async throws -> AgentTaskSnapshot {
        guard let repository = handle.repository else {
            throw AgentProviderError.missingRepository
        }
        let path = "/agents/repos/\(escape(repository.owner))/\(escape(repository.name))/tasks/\(escape(handle.id))"
        let response = try await apiClient.send(
            GitHubAPIRequest(method: .get, path: path, headers: Self.agentTasksVersionHeader)
        )
        return try snapshot(from: decodeTask(from: response), repository: repository)
    }

    public func listTasks(repository: RepositoryRef?) async throws -> [AgentTaskSnapshot] {
        let path: String
        if let repository {
            path = "/agents/repos/\(escape(repository.owner))/\(escape(repository.name))/tasks"
        } else {
            path = "/agents/tasks"
        }
        let response = try await apiClient.send(
            GitHubAPIRequest(method: .get, path: path, headers: Self.agentTasksVersionHeader)
        )
        let tasks = try decodeTaskList(from: response)
        return try tasks.map { try snapshot(from: $0, repository: repository) }
    }

    public func events(for handle: AgentTaskHandle) -> AsyncThrowingStream<AgentTaskEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let snapshot = try await taskStatus(handle)
                    continuation.yield(AgentTaskEvent(taskID: handle.id, kind: .status, message: snapshot.progressSummary ?? snapshot.status.rawValue))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func cancelTask(_ handle: AgentTaskHandle) async throws {
        throw AgentProviderError.unsupportedCapability(provider: id, capability: .cancelTask)
    }

    public func deepLink(for draft: AgentTaskDraft) async -> URL? {
        var components = URLComponents(url: webBaseURL.appendingPathComponent("\(draft.repository.owner)/\(draft.repository.name)/issues/new"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "title", value: "Agent task"),
            URLQueryItem(name: "body", value: draft.prompt)
        ]
        return components?.url
    }

    private func decodeTask(from response: GitHubAPIResponse) throws -> GitHubAgentTaskDTO {
        try response.decode(GitHubAgentTaskDTO.self, decoder: jsonDecoder)
    }

    private func decodeTaskList(from response: GitHubAPIResponse) throws -> [GitHubAgentTaskDTO] {
        if let envelope = try? response.decode(GitHubAgentTaskListEnvelope.self, decoder: jsonDecoder) {
            return envelope.tasks
        }
        return try response.decode([GitHubAgentTaskDTO].self, decoder: jsonDecoder)
    }

    private func snapshot(from dto: GitHubAgentTaskDTO, repository: RepositoryRef?) throws -> AgentTaskSnapshot {
        guard let taskID = dto.id.map(String.init(describing:)) ?? dto.taskID else {
            throw AgentProviderError.missingTaskID
        }
        let links = dto.htmlURL.map { [WebLink(label: "GitHub", url: $0)] } ?? []
        let handle = AgentTaskHandle(id: taskID, providerID: id, repository: repository ?? dto.repository, links: links)
        return AgentTaskSnapshot(
            id: taskID,
            handle: handle,
            status: AgentTaskStatus(githubState: dto.state),
            lifecycleStage: AgentTaskLifecycleStage(githubState: dto.state),
            branchName: dto.branchName,
            pullRequestURL: dto.pullRequestURL,
            progressSummary: dto.state,
            updatedAt: dto.updatedAt ?? Date(),
            metadata: dto.metadata
        )
    }

    private func escape(_ pathComponent: String) -> String {
        pathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? pathComponent
    }
}

private struct GitHubStartTaskRequest: Encodable {
    var prompt: String
    var baseRef: String?
    var model: String?
    var createPullRequest: Bool

    enum CodingKeys: String, CodingKey {
        case prompt
        case baseRef = "base_ref"
        case model
        case createPullRequest = "create_pull_request"
    }
}

private struct GitHubAgentTaskListEnvelope: Decodable {
    var tasks: [GitHubAgentTaskDTO]
}

private struct GitHubAgentTaskDTO: Decodable {
    var id: String?
    var taskID: String?
    var state: String?
    var htmlURL: URL?
    var pullRequestURL: URL?
    var branchName: String?
    var updatedAt: Date?
    var repository: RepositoryRef?
    var metadata: [String: String]

    enum CodingKeys: String, CodingKey {
        case id
        case taskID = "task_id"
        case state
        case htmlURL = "html_url"
        case pullRequestURL = "pull_request_url"
        case branchName = "branch"
        case updatedAt = "updated_at"
        case repository
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        taskID = try container.decodeIfPresent(String.self, forKey: .taskID)
        state = try container.decodeIfPresent(String.self, forKey: .state)
        htmlURL = try container.decodeIfPresent(URL.self, forKey: .htmlURL)
        pullRequestURL = try container.decodeIfPresent(URL.self, forKey: .pullRequestURL)
        branchName = try container.decodeIfPresent(String.self, forKey: .branchName)
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
        repository = try container.decodeIfPresent(RepositoryRef.self, forKey: .repository)
        metadata = [:]
    }
}

private extension AgentTaskStatus {
    init(githubState: String?) {
        switch githubState {
        case "queued":
            self = .queued
        case "in_progress":
            self = .inProgress
        case "idle":
            self = .idle
        case "waiting_for_user":
            self = .waitingForUser
        case "completed":
            self = .completed
        case "failed":
            self = .failed
        case "timed_out":
            self = .timedOut
        case "cancelled":
            self = .cancelled
        default:
            self = .unsupported
        }
    }
}

private extension AgentTaskLifecycleStage {
    init(githubState: String?) {
        switch githubState {
        case "queued":
            self = .started
        case "in_progress", "idle", "waiting_for_user":
            self = .running
        case "completed":
            self = .reviewable
        case "failed", "timed_out", "cancelled":
            self = .closed
        default:
            self = .started
        }
    }
}
