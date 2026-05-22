import KarabinerCore
import SwiftUI

struct WorkspaceCard: View {
    var workspace: Workspace
    var openWorkspace: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(workspace.repositoryFullName)
                            .font(.title3.bold())
                            .lineLimit(2)
                            .accessibilityAddTraits(.isHeader)

                        Label(workspace.branchName, systemImage: "arrow.triangle.branch")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: KarabinerDesign.compactPadding)

                    StatusChip(
                        title: workspace.state.displayName,
                        systemImage: workspace.state.systemImage,
                        tint: workspace.state.tint
                    )
                }

                HStack {
                    Label("^[\(workspace.activeAgentSessionIDs.count) agent](inflect: true)", systemImage: "person.3.sequence")
                    Label("^[\(workspace.linkedPullRequestIDs.count) pull request](inflect: true)", systemImage: "arrow.triangle.pull")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Divider()

                LabeledContent("Cached files", value: "\(workspace.cacheSummary.fileCount)")
                LabeledContent("Drafts", value: "\(workspace.cacheSummary.dirtyDraftCount)")
                LabeledContent("Index", value: workspace.cacheSummary.isSearchIndexFresh ? "Fresh" : "Needs refresh")

                Button("Open Workspace", systemImage: "folder", action: openWorkspace)
                    .buttonStyle(.borderedProminent)
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                    .accessibilityHint("Opens this workspace.")
            }
        }
        .accessibilityLabel("\(workspace.repositoryFullName), branch \(workspace.branchName), \(workspace.state.displayName), \(workspace.activeAgentSessionIDs.count) active agents.")
    }
}
