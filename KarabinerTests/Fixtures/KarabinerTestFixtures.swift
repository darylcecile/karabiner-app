import Foundation
import KarabinerCore

struct RuntimeRiskFixture: Sendable {
    var capability: RuntimeCapability
    var expectedRiskTier: RiskTier
}

struct PermissionGateFixture: Sendable {
    var gate: PermissionGate
    var expectedMinimumRiskTier: RiskTier
}

enum KarabinerTestFixtures {
    static let fixedDate = Date(timeIntervalSince1970: 1_800_000_000)

    static let repositoryRef = RepositoryRef(owner: "octocat", name: "karabiner", defaultBranch: "main")

    static let repository = GitHubRepository(
        id: 42,
        ownerLogin: "octocat",
        name: "karabiner",
        visibility: .private,
        defaultBranch: "main",
        htmlURL: URL(string: "https://github.com/octocat/karabiner")!,
        permissions: .init(
            canRead: true,
            canWrite: true,
            canAdmin: false,
            canCreatePullRequest: true,
            canMergePullRequest: false
        )
    )

    static let cleanCache = CacheSummary(
        fileCount: 128,
        dirtyDraftCount: 0,
        totalBytes: 2_048_000,
        lastIndexedAt: fixedDate,
        indexRef: "main",
        isSearchIndexFresh: true
    )

    static let dirtyCache = CacheSummary(
        fileCount: 129,
        dirtyDraftCount: 2,
        totalBytes: 2_049_024,
        lastIndexedAt: fixedDate,
        indexRef: "feature/ipad-shell",
        isSearchIndexFresh: false
    )

    static let providerCapabilityManifest = ProviderCapabilityManifest(
        lifecycle: .taskAPI,
        streaming: .pollingOnly,
        runtimeCapabilities: [
            .fileRead,
            .fileWrite,
            .testCommands,
            .taskLifecycle,
            .streamingLogs,
            .artifacts,
            .pullRequestWrites,
            .budgetTelemetry
        ],
        supportedBillingPaths: [.githubCopilotSubscription],
        supportsOfficialSubscriptionAuth: true,
        supportsBYOK: false,
        supportsPullRequestWrites: true,
        supportsSecrets: false,
        limitationNotes: [
            "Copilot Agent Tasks API availability is plan- and organization-dependent.",
            "Project code executes in GitHub-hosted environments, not inside the iPad app."
        ]
    )

    static let providerDescriptor = AgentProviderDescriptor(
        id: "github-copilot",
        kind: .githubCopilot,
        displayName: "GitHub Copilot cloud agent",
        officialAuthMethods: [.githubOAuth],
        repositoryAccessDescription: "Uses GitHub repositories, Issues, Pull Requests, Actions, and Checks.",
        executionEnvironmentDescription: "Runs work in GitHub-hosted cloud agent environments.",
        defaultCapabilityManifest: providerCapabilityManifest,
        documentationURL: URL(string: "https://docs.github.com/copilot"),
        isDefaultProvider: true
    )

    static func providerConnection(
        authState: AuthState = .connected,
        lifecycle: ProviderLifecycleSupport = .taskAPI
    ) -> AgentProviderConnection {
        var manifest = providerCapabilityManifest
        manifest.lifecycle = lifecycle

        return AgentProviderConnection(
            id: "connection-github-copilot",
            providerID: providerDescriptor.id,
            providerKind: providerDescriptor.kind,
            accountLabel: "@octocat",
            accountID: "octocat",
            authState: authState,
            billingPath: .githubCopilotSubscription,
            activeAuthMethod: .githubOAuth,
            capabilityManifest: manifest,
            apiLimits: estimatedAPILimits,
            connectedAt: fixedDate,
            lastValidatedAt: fixedDate
        )
    }

    static let estimatedAPILimits = APILimits(
        requestsPerMinute: nil,
        requestsPerHour: nil,
        concurrentSessions: 5,
        maxContextTokens: nil,
        maxRuntimeMinutes: nil,
        precision: .estimated,
        notes: ["Preview API limits may vary by organization policy."]
    )

    static let providerReportedAPILimits = APILimits(
        requestsPerMinute: 60,
        requestsPerHour: 1_000,
        concurrentSessions: 5,
        maxContextTokens: 200_000,
        maxRuntimeMinutes: 120,
        precision: .providerReported
    )

    static let restrictedNetworkPolicy = NetworkPolicy(
        mode: .allowlistedDomains,
        allowedDomains: ["api.github.com", "github.com"],
        requiresApprovalForUnknownDomains: true
    )

    static let handlesOnlySecretPolicy = SecretAccessPolicy(
        mode: .handlesOnly,
        allowedSecretScopes: ["github/actions", "provider/session"],
        auditEveryReveal: true
    )

    static func remoteRuntime(
        health: ExecutionRuntimeDescriptor.Health = .healthy,
        trustLevel: ExecutionRuntimeDescriptor.TrustLevel = .githubManaged
    ) -> ExecutionRuntimeDescriptor {
        ExecutionRuntimeDescriptor(
            id: "runtime-github-hosted",
            kind: .githubHostedAgent,
            displayName: "GitHub-hosted cloud agent",
            providerID: providerDescriptor.id,
            accountLabel: "@octocat",
            health: health,
            trustLevel: trustLevel,
            repositoryScope: [repository.fullName],
            capabilities: [.fileRead, .fileWrite, .testCommands, .pullRequestWrites, .budgetTelemetry],
            apiLimits: estimatedAPILimits,
            networkPolicy: restrictedNetworkPolicy,
            secretPolicy: handlesOnlySecretPolicy,
            lastUsedAt: fixedDate
        )
    }

    static func localCacheRuntime(
        health: ExecutionRuntimeDescriptor.Health = .healthy
    ) -> ExecutionRuntimeDescriptor {
        ExecutionRuntimeDescriptor(
            id: "runtime-ipad-cache",
            kind: .onDeviceCache,
            displayName: "iPad local cache",
            health: health,
            trustLevel: .localCacheOnly,
            capabilities: [.fileRead, .artifacts],
            apiLimits: APILimits(precision: .unavailable),
            networkPolicy: NetworkPolicy(mode: .denied),
            secretPolicy: SecretAccessPolicy(mode: .denied)
        )
    }

    static let workspaceRestoration = Workspace(
        id: "workspace-octocat-karabiner-main",
        repositoryID: repository.id,
        repositoryFullName: repository.fullName,
        branchName: "feature/ipad-shell",
        baseBranchName: "main",
        state: .offlineCache,
        activeAgentSessionIDs: ["session-plan", "session-review"],
        linkedPullRequestIDs: [101, 102],
        runtimeIDs: ["runtime-github-hosted", "runtime-ipad-cache"],
        cacheSummary: dirtyCache,
        lastOpenedAt: fixedDate
    )

    static func disclosure(
        providerName: String = "GitHub Copilot cloud agent",
        runtimeName: String = "GitHub-hosted cloud agent",
        accountLabel: String = "@octocat",
        branchName: String = "feature/ipad-shell",
        runtimeKind: ExecutionRuntimeDescriptor.Kind = .githubHostedAgent,
        streamingSupport: StreamingSupport = .pollingOnly,
        apiLimits: APILimits = estimatedAPILimits,
        limitations: [String] = []
    ) -> AgentSessionDisclosure {
        AgentSessionDisclosure(
            providerName: providerName,
            providerKind: .githubCopilot,
            runtimeName: runtimeName,
            runtimeKind: runtimeKind,
            accountLabel: accountLabel,
            billingPath: .githubCopilotSubscription,
            branchName: branchName,
            lifecycleSupport: .taskAPI,
            streamingSupport: streamingSupport,
            apiLimits: apiLimits,
            limitations: limitations
        )
    }

    static func agentSession(status: AgentSessionStatus = .awaitingApproval) -> AgentSession {
        AgentSession(
            id: "session-plan",
            workspaceID: workspaceRestoration.id,
            repositoryID: repository.id,
            promptSummary: "Implement the iPad agent cockpit shell.",
            providerConnectionID: "connection-github-copilot",
            runtimeID: "runtime-github-hosted",
            modelName: "copilot-default",
            mode: .interactive,
            status: status,
            disclosure: disclosure(),
            budgetImpact: BudgetImpact(
                billingPath: .githubCopilotSubscription,
                estimatedCostMinorUnits: nil,
                currencyCode: nil,
                requestUnits: 1,
                precision: .providerReported
            ),
            createdAt: fixedDate,
            updatedAt: fixedDate,
            providerSessionURL: URL(string: "https://github.com/octocat/karabiner"),
            reviewArtifactIDs: ["artifact-plan"]
        )
    }

    static func agentProviderCapabilities(
        providerID: AgentProviderID = .githubCopilot,
        fallbackDeepLink: URL? = URL(string: "https://github.com/features/copilot")
    ) -> AgentProviderCapabilities {
        AgentProviderCapabilities(
            providerID: providerID,
            displayName: "GitHub Copilot cloud agent",
            kind: .githubCopilotCloud,
            authentication: .githubUserToServerOAuth,
            executionEnvironment: .githubHosted,
            lifecycle: [.startTask, .listTasks, .inspectTask, .cancelTask, .pollStatus, .deepLinkFallback],
            streaming: [.polling],
            billingVisibility: .planOnly,
            limits: [
                ProviderLimit(
                    title: "Preview availability",
                    detail: "Availability depends on Copilot plan and organization policy."
                )
            ],
            supportsPullRequestWrites: true,
            supportsSecretsAccess: false,
            supportsLocalProcessExecution: false,
            fallbackDeepLink: fallbackDeepLink
        )
    }

    static let runtimeRiskFixtures: [RuntimeRiskFixture] = [
        .init(capability: .fileRead, expectedRiskTier: .low),
        .init(capability: .modelSelection, expectedRiskTier: .low),
        .init(capability: .taskLifecycle, expectedRiskTier: .low),
        .init(capability: .streamingLogs, expectedRiskTier: .low),
        .init(capability: .artifacts, expectedRiskTier: .low),
        .init(capability: .budgetTelemetry, expectedRiskTier: .low),
        .init(capability: .fileWrite, expectedRiskTier: .medium),
        .init(capability: .buildCommands, expectedRiskTier: .medium),
        .init(capability: .testCommands, expectedRiskTier: .medium),
        .init(capability: .previews, expectedRiskTier: .medium),
        .init(capability: .lsp, expectedRiskTier: .medium),
        .init(capability: .shellCommands, expectedRiskTier: .high),
        .init(capability: .dependencyInstall, expectedRiskTier: .high),
        .init(capability: .pullRequestWrites, expectedRiskTier: .high),
        .init(capability: .secretHandles, expectedRiskTier: .high),
        .init(capability: .networkEgressPolicy, expectedRiskTier: .high),
        .init(capability: .deployment, expectedRiskTier: .critical)
    ]

    static let permissionGateFixtures: [PermissionGateFixture] = [
        .init(gate: .destructiveCommand, expectedMinimumRiskTier: .high),
        .init(gate: .secretAccess, expectedMinimumRiskTier: .high),
        .init(gate: .networkAccess, expectedMinimumRiskTier: .high),
        .init(gate: .deployment, expectedMinimumRiskTier: .high),
        .init(gate: .billingImpactingUse, expectedMinimumRiskTier: .high),
        .init(gate: .pullRequestMerge, expectedMinimumRiskTier: .critical),
        .init(gate: .forcePush, expectedMinimumRiskTier: .critical),
        .init(gate: .databaseMigration, expectedMinimumRiskTier: .critical),
        .init(gate: .publicURLExposure, expectedMinimumRiskTier: .critical)
    ]
}
