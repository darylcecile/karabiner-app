import SwiftUI

public struct KarabinerRootView: View {
    @State private var selectedDestination: KarabinerNavigationDestination? = .home
    @StateObject private var store = KarabinerAppStore()

    public init() {}

    public var body: some View {
        NavigationSplitView {
            List(selection: $selectedDestination) {
                Section("Karabiner") {
                    ForEach(KarabinerNavigationDestination.allCases) { destination in
                        NavigationLink(value: destination) {
                            Label(destination.title, systemImage: destination.systemImage)
                                .accessibilityLabel(destination.accessibilityLabel)
                        }
                        .frame(minHeight: KarabinerDesign.minimumHitSize)
                    }
                }

                Section("Remote execution") {
                    Label("iPad is a control plane", systemImage: "ipad.and.arrow.forward")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("iPad is a control plane. Project code runs remotely.")
                }
            }
            .navigationTitle("Karabiner")
            .toolbar {
                ToolbarItemGroup(placement: .automatic) {
                    Button("Command Palette", systemImage: "command") {
                        selectedDestination = .home
                    }
                    .keyboardShortcut("k", modifiers: [.command])
                    .accessibilityHint("Opens command-oriented actions.")

                    Button("New Plan", systemImage: "square.and.pencil") {
                        selectedDestination = .agents
                    }
                    .keyboardShortcut("n", modifiers: [.command])
                    .accessibilityHint("Starts a plan-first agent flow when a provider is connected.")
                }
            }
        } detail: {
            selectedDetailView
                .navigationTitle(selectedDestination?.title ?? "Karabiner")
        }
        .background(.background)
        .accessibilityIdentifier("karabiner-root-view")
        .alert(item: $store.notice) { notice in
            Alert(
                title: Text(notice.title),
                message: Text(notice.message),
                dismissButton: .default(Text("OK"))
            )
        }
        .task {
            await store.load()
        }
    }

    @ViewBuilder
    private var selectedDetailView: some View {
        switch selectedDestination {
        case .home:
            HomeDashboardView(store: store) {
                selectedDestination = .settings
            }
        case .workspaces:
            WorkspacesView(store: store) {
                selectedDestination = .settings
            }
        case .agents:
            AgentFleetBoardView(store: store) {
                selectedDestination = .settings
            }
        case .review:
            ReviewApprovalsView(store: store) {
                selectedDestination = .settings
            }
        case .settings:
            SettingsView(store: store)
        case nil:
            ContentUnavailableView(
                "Select a surface",
                systemImage: "sidebar.left",
                description: Text("Choose Home, Workspaces, Agents, Review, or Settings.")
            )
        }
    }
}

#Preview {
    KarabinerRootView()
}
