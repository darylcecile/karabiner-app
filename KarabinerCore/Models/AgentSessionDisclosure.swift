import Foundation

public struct AgentSessionDisclosure: Codable, Sendable, Hashable {
    public var providerName: String
    public var providerKind: ProviderKind
    public var runtimeName: String
    public var runtimeKind: ExecutionRuntimeDescriptor.Kind
    public var accountLabel: String
    public var billingPath: BillingPath
    public var branchName: String
    public var lifecycleSupport: ProviderLifecycleSupport
    public var streamingSupport: StreamingSupport
    public var apiLimits: APILimits
    public var limitations: [String]

    public init(
        providerName: String,
        providerKind: ProviderKind,
        runtimeName: String,
        runtimeKind: ExecutionRuntimeDescriptor.Kind,
        accountLabel: String,
        billingPath: BillingPath,
        branchName: String,
        lifecycleSupport: ProviderLifecycleSupport,
        streamingSupport: StreamingSupport,
        apiLimits: APILimits,
        limitations: [String] = []
    ) {
        self.providerName = providerName
        self.providerKind = providerKind
        self.runtimeName = runtimeName
        self.runtimeKind = runtimeKind
        self.accountLabel = accountLabel
        self.billingPath = billingPath
        self.branchName = branchName
        self.lifecycleSupport = lifecycleSupport
        self.streamingSupport = streamingSupport
        self.apiLimits = apiLimits
        self.limitations = limitations
    }

    public var isComplete: Bool {
        !providerName.isEmpty && !runtimeName.isEmpty && !accountLabel.isEmpty && !branchName.isEmpty
    }

    public var canClaimStreaming: Bool { streamingSupport.hasRealtimeChannel }

    public var honestyWarnings: [String] {
        var warnings: [String] = []
        if !isComplete {
            warnings.append("Provider, runtime, account, billing path, and branch must be visible before launch.")
        }
        if apiLimits.shouldAvoidExactCostClaims {
            warnings.append("API limits or costs are not exact; use provider-appropriate wording.")
        }
        if !runtimeKind.permitsProjectCodeExecution {
            warnings.append("This runtime is for local cache/draft use only and cannot execute project code.")
        }
        return warnings + limitations
    }
}
