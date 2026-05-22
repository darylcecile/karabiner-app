import Foundation

public struct AgentSession: Identifiable, Codable, Sendable, Hashable {
    public enum Mode: String, Codable, Sendable, Hashable, CaseIterable {
        case plan
        case interactive
        case autopilot
        case fleet
        case reviewOnly
    }

    public var id: String
    public var workspaceID: Workspace.ID
    public var repositoryID: GitHubRepository.ID
    public var promptSummary: String
    public var providerConnectionID: AgentProviderConnection.ID
    public var runtimeID: ExecutionRuntimeDescriptor.ID
    public var modelName: String?
    public var mode: Mode
    public var status: AgentSessionStatus
    public var disclosure: AgentSessionDisclosure
    public var budgetImpact: BudgetImpact?
    public var createdAt: Date
    public var updatedAt: Date
    public var providerSessionURL: URL?
    public var reviewArtifactIDs: [ReviewableArtifact.ID]

    public init(
        id: String,
        workspaceID: Workspace.ID,
        repositoryID: GitHubRepository.ID,
        promptSummary: String,
        providerConnectionID: AgentProviderConnection.ID,
        runtimeID: ExecutionRuntimeDescriptor.ID,
        modelName: String? = nil,
        mode: Mode,
        status: AgentSessionStatus,
        disclosure: AgentSessionDisclosure,
        budgetImpact: BudgetImpact? = nil,
        createdAt: Date,
        updatedAt: Date,
        providerSessionURL: URL? = nil,
        reviewArtifactIDs: [ReviewableArtifact.ID] = []
    ) {
        self.id = id
        self.workspaceID = workspaceID
        self.repositoryID = repositoryID
        self.promptSummary = promptSummary
        self.providerConnectionID = providerConnectionID
        self.runtimeID = runtimeID
        self.modelName = modelName
        self.mode = mode
        self.status = status
        self.disclosure = disclosure
        self.budgetImpact = budgetImpact
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.providerSessionURL = providerSessionURL
        self.reviewArtifactIDs = reviewArtifactIDs
    }

    public var launchValidationWarnings: [String] {
        disclosure.honestyWarnings
    }

    public var requiresApprovalBeforeContinuing: Bool { status == .awaitingApproval }
}
