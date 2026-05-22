import KarabinerCore
import SwiftUI

struct RepositoryCard: View {
    var repository: GitHubRepository
    var openWorkspace: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(repository.fullName)
                            .font(.title3.bold())
                            .lineLimit(2)
                            .accessibilityAddTraits(.isHeader)

                        Label(repository.defaultBranch, systemImage: "arrow.triangle.branch")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: KarabinerDesign.compactPadding)

                    StatusChip(
                        title: repository.visibility.rawValue.capitalized,
                        systemImage: repository.visibility == .private ? "lock.fill" : "globe",
                        tint: repository.visibility == .private ? .orange : .green
                    )
                }

                HStack {
                    if repository.isFork {
                        Label("Fork", systemImage: "tuningfork")
                    }
                    if repository.isArchived {
                        Label("Archived", systemImage: "archivebox")
                    }
                    Label(repository.permissions.canWrite ? "Write access" : "Read access", systemImage: "key")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Button("Open Workspace", systemImage: "folder") {
                    openWorkspace()
                }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: KarabinerDesign.minimumHitSize)
                .disabled(repository.isArchived)
                .accessibilityHint(repository.isArchived ? "Archived repositories cannot be opened for new work." : "Creates a workspace for this repository.")
            }
        }
        .accessibilityLabel("\(repository.fullName), default branch \(repository.defaultBranch), \(repository.visibility.rawValue), \(repository.permissions.canWrite ? "write" : "read") access.")
    }
}
