import Foundation
import KarabinerCore
import Testing

struct ProviderFoundationTests {
    @Test("Provider manifests report only declared runtime capabilities")
    func capabilityManifestSupportIsExplicit() {
        let manifest = KarabinerTestFixtures.providerCapabilityManifest

        #expect(manifest.supports(.fileRead))
        #expect(manifest.supports(.pullRequestWrites))
        #expect(manifest.supports(.secretHandles) == false)

        let missing = manifest.missingCapabilities(from: [.fileRead, .secretHandles, .deployment])

        #expect(missing == [.secretHandles, .deployment])
    }

    @Test("Provider auth methods expose whether they store secret material", arguments: ProviderAuthMethod.allCases)
    func providerAuthMethodsIdentifySecretMaterial(_ method: ProviderAuthMethod) {
        let expected = method == .apiKey || method == .sshKey || method == .serverPassword

        #expect(method.storesSecretMaterial == expected)
    }

    @Test("Provider connections require both connected auth and start lifecycle support")
    func providerConnectionLaunchGateRequiresAuthAndCapability() {
        let connected = KarabinerTestFixtures.providerConnection()
        let disconnected = KarabinerTestFixtures.providerConnection(authState: .expired)
        let handoffOnly = KarabinerTestFixtures.providerConnection(lifecycle: .handoffOnly)

        #expect(connected.canLaunchAgentSession)
        #expect(disconnected.canLaunchAgentSession == false)
        #expect(handoffOnly.canLaunchAgentSession == false)
    }

    @Test("GitHub Copilot adapter declares preview limits and no iPad-local execution")
    func githubCopilotCapabilitiesAreHonestAboutExecutionAndLimits() async {
        let adapter = GitHubCopilotAgentProviderAdapter(apiClient: InMemoryGitHubAPIClient())
        let capabilities = await adapter.capabilities()

        #expect(capabilities.providerID == .githubCopilot)
        #expect(capabilities.executionEnvironment == .githubHosted)
        #expect(capabilities.lifecycle.contains(.startTask))
        #expect(capabilities.lifecycle.contains(.deepLinkFallback))
        #expect(capabilities.streaming == [.polling])
        #expect(capabilities.supportsPullRequestWrites)
        #expect(capabilities.supportsSecretsAccess == false)
        #expect(capabilities.supportsLocalProcessExecution == false)
        #expect(capabilities.billingVisibility == .planOnly)
        #expect(capabilities.limits.map(\.detail).joined(separator: " ").contains("Business or Enterprise"))
        #expect(capabilities.limits.map(\.detail).joined(separator: " ").contains("not inside the iPad app"))
    }

    @Test("Deep-link provider adapter exposes handoff status and rejects unsupported API lifecycle")
    func deepLinkAdapterIsExplicitAboutHandoffOnlyBehavior() async throws {
        let adapter = DeepLinkAgentProviderAdapter(
            id: .openCode,
            manifest: KarabinerTestFixtures.agentProviderCapabilities(providerID: .openCode),
            makeDeepLink: { draft in
                URL(string: "https://github.com/\(draft.repository.owner)/\(draft.repository.name)/issues/new?template=agent")
            }
        )
        let draft = AgentTaskDraft(prompt: "Draft an implementation plan.", repository: KarabinerTestFixtures.repositoryRef)
        let capabilities = await adapter.capabilities()
        let deepLink = await adapter.deepLink(for: draft)

        #expect(capabilities.providerID == .openCode)
        #expect(deepLink?.host() == "github.com")

        do {
            _ = try await adapter.startTask(draft)
            Issue.record("Deep-link-only adapters must not claim API task start support.")
        } catch AgentProviderError.unsupportedCapability(let provider, let capability) {
            #expect(provider == .openCode)
            #expect(capability == .startTask)
        } catch {
            Issue.record("Expected an unsupported capability error, got \(error).")
        }

        let handle = AgentTaskHandle(id: "handoff", providerID: .openCode, repository: KarabinerTestFixtures.repositoryRef)
        let events = try await collectEvents(from: adapter.events(for: handle))

        #expect(events.count == 1)
        #expect(events.first?.kind == .status)
        #expect(events.first?.message.contains("deep link") == true)
    }

    @Test("In-memory provider adapter preserves task lifecycle and repository filtering")
    func inMemoryProviderAdapterSupportsDeterministicContractTests() async throws {
        let adapter = InMemoryAgentProviderAdapter(
            id: .githubCopilot,
            manifest: KarabinerTestFixtures.agentProviderCapabilities()
        )
        let otherRepository = RepositoryRef(owner: "octocat", name: "other", defaultBranch: "main")

        let firstDraft = AgentTaskDraft(prompt: "Add provider tests.", repository: KarabinerTestFixtures.repositoryRef)
        let secondDraft = AgentTaskDraft(prompt: "Add UI tests.", repository: otherRepository)
        let firstSnapshot = try await adapter.startTask(firstDraft)
        _ = try await adapter.startTask(secondDraft)

        let filtered = try await adapter.listTasks(repository: KarabinerTestFixtures.repositoryRef)
        let status = try await adapter.taskStatus(firstSnapshot.handle)
        try await adapter.cancelTask(firstSnapshot.handle)
        let cancelled = try await adapter.taskStatus(firstSnapshot.handle)
        let events = try await collectEvents(from: adapter.events(for: firstSnapshot.handle))

        #expect(filtered.count == 1)
        #expect(filtered.first?.handle.repository == KarabinerTestFixtures.repositoryRef)
        #expect(status.status == .queued)
        #expect(status.lifecycleStage == .started)
        #expect(cancelled.status == .cancelled)
        #expect(cancelled.lifecycleStage == .closed)
        #expect(events.first?.message == "In-memory provider has no live stream.")
    }
}

private func collectEvents(from stream: AsyncThrowingStream<AgentTaskEvent, Error>) async throws -> [AgentTaskEvent] {
    var events: [AgentTaskEvent] = []
    for try await event in stream {
        events.append(event)
    }
    return events
}
