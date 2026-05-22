import SwiftUI

struct RemoteExecutionBanner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var activeSheet: RemoteExecutionSheet?

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                Label("Remote execution only", systemImage: "cloud")
                    .font(.title3.bold())
                    .foregroundStyle(.blue)
                    .accessibilityAddTraits(.isHeader)

                Text("Karabiner is a native iPad control plane. Agents, builds, tests, package installs, previews, and deployments run in GitHub, provider cloud, Codespaces, or trusted user-owned runtimes—not as arbitrary project code inside the iPad app.")
                    .font(.body)
                    .foregroundStyle(.primary)

                HStack {
                    Button("Learn model", systemImage: "info.circle") {
                        activeSheet = .executionModel
                    }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut("i", modifiers: [.command, .shift])
                        .accessibilityHint("Explains how remote execution is represented.")

                    Button("Review runtimes", systemImage: "server.rack") {
                        activeSheet = .runtimes
                    }
                        .buttonStyle(.bordered)
                        .keyboardShortcut("r", modifiers: [.command, .shift])
                        .accessibilityHint("Shows connected runtimes.")
                }
                .controlSize(.regular)
                .frame(minHeight: KarabinerDesign.minimumHitSize)

                if reduceMotion {
                    Text("Motion-sensitive status effects are disabled.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityLabel("Remote execution only. The iPad app does not execute arbitrary project code locally.")
        .sheet(item: $activeSheet) { sheet in
            RemoteExecutionSheetView(sheet: sheet)
        }
    }
}

private enum RemoteExecutionSheet: Identifiable {
    case executionModel
    case runtimes

    var id: Self { self }

    var title: String {
        switch self {
        case .executionModel:
            "Execution model"
        case .runtimes:
            "Runtime review"
        }
    }

    var systemImage: String {
        switch self {
        case .executionModel:
            "cloud"
        case .runtimes:
            "server.rack"
        }
    }

    var message: String {
        switch self {
        case .executionModel:
            "Karabiner is the iPad control plane. It can prepare, review, and approve remote work, but project code execution must happen in GitHub, provider cloud, Codespaces, or a trusted user-owned runtime."
        case .runtimes:
            "Connected runtimes are reviewed in Settings. This build shows only real runtime connections; if none are connected, Settings remains empty instead of inventing sample machines."
        }
    }
}

private struct RemoteExecutionSheetView: View {
    @Environment(\.dismiss) private var dismiss
    var sheet: RemoteExecutionSheet

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: KarabinerDesign.contentPadding) {
                Label(sheet.title, systemImage: sheet.systemImage)
                    .font(.title.bold())
                    .accessibilityAddTraits(.isHeader)

                Text(sheet.message)
                    .font(.body)
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding(KarabinerDesign.contentPadding)
            .navigationTitle(sheet.title)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
