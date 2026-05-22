import Foundation
import KarabinerCore
import Testing

struct ApprovalPolicyTests {
    @Test("Runtime capabilities map to documented default risk tiers", arguments: KarabinerTestFixtures.runtimeRiskFixtures)
    func runtimeCapabilitiesHaveExpectedDefaultRiskTiers(_ fixture: RuntimeRiskFixture) {
        #expect(fixture.capability.defaultRiskTier == fixture.expectedRiskTier)
    }

    @Test("Risk tiers expose approval, policy, and strong confirmation posture")
    func riskTierApprovalPostureMatchesPolicyLanguage() {
        #expect(RiskTier.low.requiresExplicitApproval == false)
        #expect(RiskTier.medium.requiresExplicitApproval)
        #expect(RiskTier.high.requiresPolicyCheck)
        #expect(RiskTier.critical.requiresPolicyCheck)
        #expect(RiskTier.critical.requiresStrongConfirmation)
        #expect(RiskTier.low < RiskTier.medium)
        #expect(RiskTier.medium < RiskTier.high)
        #expect(RiskTier.high < RiskTier.critical)
        #expect(RiskTier.critical.defaultBehaviorDescription.contains("strong confirmation"))
    }

    @Test("Low-risk repository reads can be auto-approved when configured")
    func lowRiskRepositoryReadCanBeAutoApproved() async {
        let policy = DefaultApprovalPolicy()
        let request = ApprovalPolicyRequest(
            action: .readRepository,
            risk: .low,
            summary: "Read README and package metadata."
        )

        let decision = await policy.evaluate(request, in: ApprovalContext(repository: KarabinerTestFixtures.repositoryRef))

        guard case .allow(let reason, let expiresAt) = decision else {
            Issue.record("Expected low-risk repository reads to be allowed, got \(decision).")
            return
        }
        #expect(reason.contains("Low-risk repository read"))
        #expect(expiresAt == nil)
    }

    @Test("Local process execution is denied even if a request is marked low risk")
    func localProcessExecutionIsDeniedByControlPlanePolicy() async {
        let policy = DefaultApprovalPolicy()
        let request = ApprovalPolicyRequest(
            action: .localProcessExecution,
            risk: .low,
            summary: "Run npm test on iPad."
        )

        let decision = await policy.evaluate(request, in: ApprovalContext(runtimeID: "runtime-ipad-cache"))

        guard case .deny(let reason) = decision else {
            Issue.record("Expected local process execution to be denied, got \(decision).")
            return
        }
        #expect(reason.contains("control plane"))
        #expect(reason.contains("must not run"))
    }

    @Test("Elevated approval risks require user review", arguments: [ApprovalRiskTier.medium, .high, .critical])
    func elevatedApprovalRiskTiersRequireReview(_ risk: ApprovalRiskTier) async {
        let policy = DefaultApprovalPolicy()
        let request = ApprovalPolicyRequest(
            action: .writeRepository,
            risk: risk,
            summary: "Modify project files."
        )

        let decision = await policy.evaluate(request, in: ApprovalContext(repository: KarabinerTestFixtures.repositoryRef))

        guard case .requiresUserApproval(let reason) = decision else {
            Issue.record("Expected \(risk.rawValue) risk to require approval, got \(decision).")
            return
        }
        #expect(reason.contains("requires review"))
    }

    @Test("Secrets, merges, deployments, network egress, and cost overruns require explicit approval")
    func sensitiveActionsRequireUserApproval() async {
        let policy = DefaultApprovalPolicy(
            allowedNetworkDomains: ["api.github.com"],
            maxAutoApprovedCostCents: 25
        )
        let context = ApprovalContext(repository: KarabinerTestFixtures.repositoryRef, providerID: .githubCopilot)
        let requests = [
            ApprovalPolicyRequest(action: .accessSecret, risk: .high, summary: "Use deployment token.", secretReferences: ["deploy-token"]),
            ApprovalPolicyRequest(action: .mergePullRequest, risk: .critical, summary: "Merge PR #42."),
            ApprovalPolicyRequest(action: .deploy, risk: .critical, summary: "Deploy production app."),
            ApprovalPolicyRequest(action: .externalNetwork, risk: .high, summary: "Fetch package.", networkDomains: ["registry.npmjs.org"]),
            ApprovalPolicyRequest(action: .spendBudget, risk: .medium, summary: "Run provider task.", estimatedCostCents: 100)
        ]

        for request in requests {
            let decision = await policy.evaluate(request, in: context)
            guard case .requiresUserApproval(let reason) = decision else {
                Issue.record("Expected \(request.action.rawValue) to require approval, got \(decision).")
                continue
            }
            #expect(reason.isEmpty == false)
        }
    }

    @Test("Provider and runtime allowlists deny unapproved execution surfaces")
    func providerAndRuntimeAllowlistsDenyUnapprovedSurfaces() async {
        let policy = DefaultApprovalPolicy(
            allowedProviders: [.githubCopilot],
            allowedRuntimes: ["runtime-github-hosted"]
        )
        let request = ApprovalPolicyRequest(
            action: .readRepository,
            risk: .low,
            summary: "Read source files."
        )

        let deniedProvider = await policy.evaluate(
            request,
            in: ApprovalContext(providerID: .claude, runtimeID: "runtime-github-hosted")
        )
        let deniedRuntime = await policy.evaluate(
            request,
            in: ApprovalContext(providerID: .githubCopilot, runtimeID: "runtime-untrusted")
        )

        guard case .deny(let providerReason) = deniedProvider else {
            Issue.record("Expected unapproved provider to be denied, got \(deniedProvider).")
            return
        }
        guard case .deny(let runtimeReason) = deniedRuntime else {
            Issue.record("Expected unapproved runtime to be denied, got \(deniedRuntime).")
            return
        }
        #expect(providerReason.contains(AgentProviderID.claude.rawValue))
        #expect(runtimeReason.contains("runtime-untrusted"))
    }
}
