import Foundation
import KarabinerCore
import Testing

struct WorkspaceRestorationTests {
    @Test("Workspace restoration fixtures round-trip through Codable without losing session links")
    func workspaceRestorationRoundTripsThroughCodable() throws {
        let workspace = KarabinerTestFixtures.workspaceRestoration
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601

        let data = try encoder.encode(workspace)
        let restored = try decoder.decode(Workspace.self, from: data)

        #expect(restored == workspace)
        #expect(restored.activeAgentSessionIDs == ["session-plan", "session-review"])
        #expect(restored.linkedPullRequestIDs == [101, 102])
        #expect(restored.runtimeIDs.contains("runtime-github-hosted"))
        #expect(restored.cacheSummary.hasOfflineWork)
        #expect(restored.isReviewable)
    }

    @Test("Archived workspaces are not reviewable but offline caches are")
    func workspaceReviewabilityDistinguishesArchivedState() {
        var archived = KarabinerTestFixtures.workspaceRestoration
        archived.state = .archived

        #expect(KarabinerTestFixtures.workspaceRestoration.isReviewable)
        #expect(archived.isReviewable == false)
    }

    @Test("Agent disclosures warn when provider, runtime, cost, or local execution claims are incomplete")
    func agentSessionDisclosureHonestyWarningsExposeGaps() {
        let completeProviderReported = KarabinerTestFixtures.disclosure(apiLimits: KarabinerTestFixtures.providerReportedAPILimits)
        let incomplete = KarabinerTestFixtures.disclosure(providerName: "", accountLabel: "")
        let localOnly = KarabinerTestFixtures.disclosure(
            runtimeName: "iPad local cache",
            runtimeKind: .onDeviceCache,
            limitations: ["Manual review required before continuing."]
        )

        #expect(completeProviderReported.honestyWarnings.isEmpty)
        #expect(completeProviderReported.canClaimStreaming == false)
        #expect(incomplete.honestyWarnings.contains("Provider, runtime, account, billing path, and branch must be visible before launch."))
        #expect(localOnly.honestyWarnings.contains("API limits or costs are not exact; use provider-appropriate wording."))
        #expect(localOnly.honestyWarnings.contains("This runtime is for local cache/draft use only and cannot execute project code."))
        #expect(localOnly.honestyWarnings.contains("Manual review required before continuing."))
    }

    @Test("Realtime streaming claims are only allowed when a realtime channel exists")
    func realtimeStreamingClaimsRequireRealtimeTransport() {
        let realtime = StreamingSupport(
            transcript: .serverSentEvents,
            logs: .polling,
            toolCalls: .polling,
            diffUpdates: .webSocket
        )
        let disclosure = KarabinerTestFixtures.disclosure(
            streamingSupport: realtime,
            apiLimits: KarabinerTestFixtures.providerReportedAPILimits
        )

        #expect(realtime.hasRealtimeChannel)
        #expect(disclosure.canClaimStreaming)
    }

    @Test("Agent session status gates approval and review artifact exposure")
    func agentSessionStatusControlsRestorationBehavior() {
        let awaitingApproval = KarabinerTestFixtures.agentSession(status: .awaitingApproval)
        let running = KarabinerTestFixtures.agentSession(status: .running)
        let reviewable = KarabinerTestFixtures.agentSession(status: .reviewable)
        let merged = KarabinerTestFixtures.agentSession(status: .merged)

        #expect(awaitingApproval.requiresApprovalBeforeContinuing)
        #expect(running.requiresApprovalBeforeContinuing == false)
        #expect(reviewable.status.canExposeReviewArtifacts)
        #expect(merged.status.isTerminal)
        #expect(merged.status.canExposeReviewArtifacts)
        #expect(awaitingApproval.launchValidationWarnings.contains("API limits or costs are not exact; use provider-appropriate wording."))
    }
}
