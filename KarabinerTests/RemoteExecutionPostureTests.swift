import Foundation
import KarabinerCore
import Testing

struct RemoteExecutionPostureTests {
    @Test("Only the iPad local cache runtime kind is forbidden from project code execution", arguments: ExecutionRuntimeDescriptor.Kind.allCases)
    func runtimeKindExecutionPostureIsExplicit(_ kind: ExecutionRuntimeDescriptor.Kind) {
        let expected = kind != .onDeviceCache

        #expect(kind.permitsProjectCodeExecution == expected)
    }

    @Test("Local cache runtime cannot run project commands and explains why")
    func localCacheRuntimeValidationBlocksProjectExecution() {
        let runtime = KarabinerTestFixtures.localCacheRuntime()
        let command = RemoteCommand(
            id: "command-local-build",
            runtimeID: runtime.id,
            intent: .build,
            displayCommand: "xcodebuild test",
            workingDirectory: "/workspace/karabiner",
            riskTier: .medium,
            createdAt: KarabinerTestFixtures.fixedDate
        )

        let issues = command.validationIssues(using: runtime)

        #expect(runtime.canRunProjectCodeRemotely == false)
        #expect(issues.contains("Project code execution is not allowed on the iPad local cache runtime."))
    }

    @Test("Remote runtimes must be healthy and trusted before execution")
    func remoteRuntimeValidationSurfacesHealthAndTrustProblems() {
        let healthy = KarabinerTestFixtures.remoteRuntime()
        let degraded = KarabinerTestFixtures.remoteRuntime(health: .degraded)
        let untrusted = KarabinerTestFixtures.remoteRuntime(trustLevel: .userOwnedUnverified)

        #expect(healthy.canRunProjectCodeRemotely)
        #expect(healthy.validationIssuesForProjectExecution().isEmpty)
        #expect(degraded.canRunProjectCodeRemotely == false)
        #expect(degraded.validationIssuesForProjectExecution().contains("Runtime is not healthy: degraded."))
        #expect(untrusted.canRunProjectCodeRemotely)
        #expect(untrusted.validationIssuesForProjectExecution().contains("Runtime requires an explicit trust ceremony before execution."))
    }

    @Test("Permission gates declare high or critical minimum risk tiers", arguments: KarabinerTestFixtures.permissionGateFixtures)
    func permissionGatesDeclareMinimumRiskTiers(_ fixture: PermissionGateFixture) {
        #expect(fixture.gate.minimumRiskTier == fixture.expectedMinimumRiskTier)
    }

    @Test("Network and secret policies require approval outside allowed scopes")
    func networkAndSecretPoliciesGuardExternalAccess() {
        let network = KarabinerTestFixtures.restrictedNetworkPolicy
        let secrets = KarabinerTestFixtures.handlesOnlySecretPolicy

        #expect(network.requiresApproval(for: "api.github.com") == false)
        #expect(network.requiresApproval(for: "registry.npmjs.org"))
        #expect(secrets.canUseHandle(scope: "github/actions"))
        #expect(secrets.canUseHandle(scope: "production/deploy") == false)
    }

    @Test("Tool invocations require approval for elevated risk or permission gates")
    func toolInvocationApprovalNeedReflectsRiskAndGates() {
        let lowRiskRead = ToolInvocation(
            id: "tool-read",
            sessionID: "session-plan",
            toolName: "read_file",
            inputSummary: "Read README.",
            riskTier: .low,
            status: .proposed
        )
        let highRiskShell = ToolInvocation(
            id: "tool-shell",
            sessionID: "session-plan",
            toolName: "run_command",
            inputSummary: "Run migration.",
            riskTier: .high,
            permissionGates: [.databaseMigration],
            status: .awaitingApproval
        )

        #expect(lowRiskRead.needsApproval == false)
        #expect(highRiskShell.needsApproval)
    }
}
