import Foundation
import KarabinerCore
import Testing

struct TelemetryAndEventTests {
    @Test("In-memory telemetry recorder captures deterministic event stubs in order")
    func inMemoryTelemetryRecorderCapturesEventsInOrder() async {
        let recorder = InMemoryTelemetryRecorder()
        let authEvent = TelemetryEvent(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            name: "auth.pkce.started",
            category: .auth,
            privacy: .userInitiated,
            attributes: ["provider": "github"],
            measurements: [:],
            createdAt: KarabinerTestFixtures.fixedDate
        )
        let approvalEvent = TelemetryEvent(
            id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
            name: "approval.required",
            category: .approval,
            privacy: .operational,
            attributes: ["risk": RiskTier.high.rawValue],
            measurements: ["affectedResources": 2],
            createdAt: KarabinerTestFixtures.fixedDate.addingTimeInterval(1)
        )

        await recorder.record(authEvent)
        await recorder.record(approvalEvent)
        let events = await recorder.events()

        #expect(events == [authEvent, approvalEvent])
        #expect(events.map(\.name) == ["auth.pkce.started", "approval.required"])
        #expect(events.last?.measurements["affectedResources"] == 2)
    }

    @Test("Audit and log event fixtures preserve source, risk, and redaction metadata")
    func auditAndLogEventsPreserveReviewMetadata() {
        let source = ExecutionSource(
            kind: .copilotCloud,
            displayName: "GitHub Copilot cloud agent",
            providerID: KarabinerTestFixtures.providerDescriptor.id,
            runtimeID: "runtime-github-hosted",
            stableURL: URL(string: "https://github.com/octocat/karabiner")
        )
        let approvalID = "approval-33333333"
        let audit = AuditEvent(
            id: "audit-approval",
            timestamp: KarabinerTestFixtures.fixedDate,
            actorLogin: "octocat",
            kind: .approval,
            result: .informational,
            riskTier: .high,
            providerID: KarabinerTestFixtures.providerDescriptor.id,
            runtimeID: "runtime-github-hosted",
            sessionID: "session-plan",
            approvalRequestID: approvalID,
            objectReference: "tool-shell",
            summary: "User approval requested for a high-risk command."
        )
        let log = LogEvent(
            id: "log-redacted",
            source: source,
            sequence: 7,
            timestamp: KarabinerTestFixtures.fixedDate,
            severity: .warning,
            message: "Secret value redacted from provider output.",
            isRedacted: true,
            relatedCommandID: "command-deploy"
        )

        #expect(source.isLocalExecution == false)
        #expect(audit.riskTier == .high)
        #expect(audit.approvalRequestID == approvalID)
        #expect(log.isRedacted)
        #expect(log.source.providerID == KarabinerTestFixtures.providerDescriptor.id)
        #expect(log.relatedCommandID == "command-deploy")
    }

    @Test("Reviewable artifacts, pull requests, files, and budgets expose review gates")
    func reviewArtifactsAndRelatedModelsExposeReviewState() {
        let artifact = ReviewableArtifact(
            id: "artifact-diff",
            kind: .diff,
            title: "Provider capability diff",
            state: .pendingReview,
            sourceProviderID: KarabinerTestFixtures.providerDescriptor.id,
            sessionID: "session-plan",
            riskTier: .medium,
            createdAt: KarabinerTestFixtures.fixedDate,
            updatedAt: KarabinerTestFixtures.fixedDate
        )
        let pullRequest = PullRequest(
            id: 101,
            number: 42,
            repositoryID: KarabinerTestFixtures.repository.id,
            title: "Implement provider foundation",
            authorLogin: "copilot",
            state: .draft,
            mergeState: .blocked,
            baseRef: "main",
            headRef: "feature/provider-foundation",
            htmlURL: URL(string: "https://github.com/octocat/karabiner/pull/42")!
        )
        let file = FileSnapshot(
            id: "file-readme",
            repositoryID: KarabinerTestFixtures.repository.id,
            path: "README.md",
            ref: "feature/provider-foundation",
            byteCount: 2_048,
            source: .localDraft,
            cacheState: .dirtyDraft
        )
        let budget = BudgetImpact(
            billingPath: .githubActionsMinutes,
            estimatedCostMinorUnits: 25,
            currencyCode: "USD",
            requestUnits: 3,
            precision: .estimate,
            budgetLimitMinorUnits: 100
        )

        #expect(artifact.isActionableReview)
        #expect(pullRequest.requiresMergeApproval)
        #expect(file.isEditableOffline)
        #expect(budget.mustShowPrecisionWarning)
    }
}
