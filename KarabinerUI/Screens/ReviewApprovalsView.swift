import KarabinerCore
import SwiftUI

struct ReviewApprovalsView: View {
    @ObservedObject var store: KarabinerAppStore
    var connectGitHub: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: KarabinerDesign.sectionSpacing) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Review and approvals")
                        .font(.title.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("Plans, diffs, checks, approvals, and logs are first-class surfaces with source and risk labels.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                RemoteExecutionBanner()

                if !store.isConnected {
                    ConnectionRequiredView(
                        title: "Connect GitHub for review data",
                        description: "Approvals, diffs, checks, artifacts, and logs are shown only when they come from real repositories or provider sessions.",
                        actionTitle: "Open Settings",
                        action: connectGitHub
                    )
                }

                approvalsContent

                ContentUnavailableView(
                    "No diff selected",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("Diffs appear after a real pull request, branch comparison, or provider artifact is loaded.")
                )
                .frame(minHeight: 180)

                VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                    Text("Checks")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)

                    checksContent
                }

                VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                    Text("Review artifacts")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)

                    artifactsContent
                }

                KarabinerCard {
                    VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                        Label("Remote logs", systemImage: "terminal")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)

                        Text("Terminal-like output is monospaced and labeled by source so it cannot be confused with local iPad execution.")
                            .font(.body)
                            .foregroundStyle(.secondary)

                        if store.logEvents.isEmpty {
                            ContentUnavailableView(
                                "No remote logs",
                                systemImage: "terminal",
                                description: Text("Logs appear only after a connected provider emits them.")
                            )
                            .frame(minHeight: 160)
                        } else {
                            ForEach(store.logEvents) { event in
                                LogEventRow(event: event)
                            }
                        }
                    }
                }
            }
            .padding(KarabinerDesign.contentPadding)
        }
        .scrollIndicators(.hidden)
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button("Approve Review", systemImage: "checkmark.seal") {
                    approveSelectedReview()
                }
                    .keyboardShortcut(.return, modifiers: [.command])
                Button("Request Changes", systemImage: "arrow.uturn.backward") {
                    requestChanges()
                }
                    .keyboardShortcut("r", modifiers: [.command, .option])
            }
        }
        .accessibilityLabel("Review and approvals screen with approval cards, diff summary, checks, artifacts, and remote logs.")
    }

    @ViewBuilder
    private var approvalsContent: some View {
        if store.approvalRequests.isEmpty {
            ContentUnavailableView(
                "No approval requests",
                systemImage: "checkmark.seal",
                description: Text("Approval requests appear when a real provider session asks to run protected work.")
            )
            .frame(minHeight: 180)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.approvalRequests) { approval in
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
    private var checksContent: some View {
        if store.checkRuns.isEmpty {
            ContentUnavailableView(
                "No checks",
                systemImage: "checkmark.circle",
                description: Text("GitHub checks and provider validations appear after real work is loaded.")
            )
            .frame(minHeight: 160)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.checkRuns) { checkRun in
                    CheckRunCard(checkRun: checkRun) {
                        openLogs(for: checkRun)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var artifactsContent: some View {
        if store.reviewArtifacts.isEmpty {
            ContentUnavailableView(
                "No review artifacts",
                systemImage: "doc.richtext",
                description: Text("Plans, pull requests, logs, and review artifacts appear after provider sessions create them.")
            )
            .frame(minHeight: 160)
        } else {
            LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                ForEach(store.reviewArtifacts) { artifact in
                    ReviewArtifactCard(artifact: artifact) {
                        openArtifact(artifact)
                    }
                }
            }
        }
    }

    private func approveSelectedReview() {
        guard let approval = store.pendingApprovals.first else {
            store.presentNotice(
                title: "No approval selected",
                message: "There are no pending approval requests to approve."
            )
            return
        }

        handleApprovalAction("Approve", approval: approval)
    }

    private func requestChanges() {
        guard let approval = store.pendingApprovals.first else {
            store.presentNotice(
                title: "No review selected",
                message: "There is no pending approval or diff selected for requesting changes."
            )
            return
        }

        handleApprovalAction("Request changes", approval: approval)
    }

    private func handleApprovalAction(_ action: String, approval: ApprovalRequest) {
        store.presentNotice(
            title: "\(action) requires provider write-back",
            message: "Karabiner has not connected a real approval write-back endpoint for \(approval.providerID). It will not fake approval state locally."
        )
    }

    private func openLogs(for checkRun: CheckRun) {
        if let detailsURL = checkRun.detailsURL {
            openURL(detailsURL)
        } else {
            store.presentNotice(
                title: "No log URL",
                message: "\(checkRun.name) has not reported a remote log URL."
            )
        }
    }

    private func openArtifact(_ artifact: ReviewableArtifact) {
        if let stableURL = artifact.stableURL {
            openURL(stableURL)
        } else {
            store.presentNotice(
                title: "No artifact URL",
                message: "\(artifact.title) has not reported a stable provider URL."
            )
        }
    }
}

#Preview {
    ReviewApprovalsView(store: KarabinerAppStore()) {}
}
