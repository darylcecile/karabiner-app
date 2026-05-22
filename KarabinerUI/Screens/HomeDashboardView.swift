import KarabinerCore
import SwiftUI

struct HomeDashboardView: View {
    @ObservedObject var store: KarabinerAppStore
    var connectGitHub: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: KarabinerDesign.sectionSpacing) {
                RemoteExecutionBanner()

                if shouldShowConnectionRequired {
                    ConnectionRequiredView(
                        title: connectionRequiredTitle,
                        description: connectionRequiredDescription,
                        actionTitle: "Open Settings",
                        action: connectGitHub
                    )
                }

                LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                    MetricCard(
                        title: "Repositories",
                        value: "\(store.repositories.count)",
                        detail: "Loaded from your GitHub account.",
                        systemImage: "folder.badge.person.crop",
                        tint: .green
                    )

                    MetricCard(
                        title: "Needs approval",
                        value: "\(store.pendingApprovals.count)",
                        detail: "Real approval requests waiting.",
                        systemImage: "person.badge.clock",
                        tint: .orange
                    )

                    MetricCard(
                        title: "Active agents",
                        value: "\(store.activeAgents.count)",
                        detail: "Remote sessions across connected providers.",
                        systemImage: "person.3.sequence",
                        tint: .blue
                    )

                    MetricCard(
                        title: "Review items",
                        value: "\(store.reviewQueueCount)",
                        detail: "Real plans, diffs, checks, and logs.",
                        systemImage: "checklist.checked",
                        tint: .indigo
                    )
                }

                SectionHeader(
                    title: "Repositories",
                    subtitle: "These come from GitHub after authentication; empty means nothing has been loaded."
                )

                repositoriesContent

                SectionHeader(
                    title: "Needs attention",
                    subtitle: "Human approvals are first-class review objects, never hidden in agent chat."
                )

                approvalsContent

                SectionHeader(
                    title: "Active agent sessions",
                    subtitle: "Provider, runtime, account, billing, branch, and capabilities stay explicit."
                )

                agentsContent

                OnboardingPanelView(openSettings: connectGitHub)
            }
            .padding(KarabinerDesign.contentPadding)
        }
        .scrollIndicators(.hidden)
        .accessibilityLabel("Home dashboard with remote execution banner, metrics, workspaces, approvals, agents, and onboarding.")
    }

    @ViewBuilder
    private var repositoriesContent: some View {
        if store.phase.isLoading {
            ProgressView("Loading GitHub repositories")
                .frame(maxWidth: .infinity, minHeight: 160)
        } else if store.repositories.isEmpty {
            ContentUnavailableView(
                "No repositories loaded",
                systemImage: "folder",
                description: Text(store.isConnected ? "Your GitHub account returned no repositories for the current token." : "Connect GitHub in Settings to load repositories.")
            )
            .frame(minHeight: 180)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.repositories) { repository in
                    RepositoryCard(repository: repository) {
                        let workspace = store.openWorkspace(for: repository)
                        store.presentNotice(
                            title: "Workspace opened",
                            message: "\(workspace.repositoryFullName) is available on the Workspaces screen."
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var approvalsContent: some View {
        if store.pendingApprovals.isEmpty {
            ContentUnavailableView(
                "No approvals",
                systemImage: "checkmark.seal",
                description: Text("Approval requests appear here only after a connected provider asks to continue real work.")
            )
            .frame(minHeight: 160)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.pendingApprovals) { approval in
                    ApprovalRequestCard(
                        approval: approval,
                        approve: { handleApprovalAction("Approve", approval: approval) },
                        deny: { handleApprovalAction("Deny", approval: approval) },
                        requestSaferPlan: { handleApprovalAction("Request safer plan", approval: approval) }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var agentsContent: some View {
        if store.activeAgents.isEmpty {
            ContentUnavailableView(
                "No active agents",
                systemImage: "person.3.sequence",
                description: Text("Agent sessions appear after a connected provider starts real remote work.")
            )
            .frame(minHeight: 160)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.activeAgents) { session in
                    AgentSessionCard(session: session) {
                        inspectEvidence(for: session)
                    }
                }
            }
        }
    }

    private func handleApprovalAction(_ action: String, approval: ApprovalRequest) {
        store.presentNotice(
            title: "\(action) requires provider write-back",
            message: "Karabiner has not connected a real approval write-back endpoint for \(approval.providerID). It will not fake approval state locally."
        )
    }

    private func inspectEvidence(for session: AgentSession) {
        if let providerSessionURL = session.providerSessionURL {
            openURL(providerSessionURL)
        } else {
            store.presentNotice(
                title: "No evidence URL",
                message: "This session has not reported a provider evidence URL yet. Plans, diffs, checks, and logs appear on Review when a provider supplies them."
            )
        }
    }

    private var shouldShowConnectionRequired: Bool {
        !store.isConnected && !store.phase.isLoading
    }

    private var connectionRequiredTitle: String {
        if case .failed = store.phase {
            "Reconnect GitHub to load real work"
        } else {
            "Connect GitHub to load real work"
        }
    }

    private var connectionRequiredDescription: String {
        if case .failed = store.phase {
            "GitHub could not validate the stored credential. Open Settings to replace or disconnect it."
        } else {
            "Karabiner does not ship demo repositories or agent runs. Connect GitHub to load repositories from the GitHub REST API."
        }
    }
}

private struct SectionHeader: View {
    var title: String
    var subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    HomeDashboardView(store: KarabinerAppStore()) {}
}
