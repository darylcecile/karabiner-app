import KarabinerCore
import SwiftUI

struct AgentFleetBoardView: View {
    @ObservedObject var store: KarabinerAppStore
    var connectGitHub: () -> Void

    private var columns: [FleetColumn] {
        [
            FleetColumn(title: "Draft", statuses: [.draft, .planning]),
            FleetColumn(title: "Running", statuses: [.running]),
            FleetColumn(title: "Needs approval", statuses: [.awaitingApproval]),
            FleetColumn(title: "Reviewable", statuses: [.reviewable]),
            FleetColumn(title: "Blocked", statuses: [.blocked, .failed]),
            FleetColumn(title: "Done", statuses: [.merged, .archived, .cancelled, .abandoned])
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: KarabinerDesign.sectionSpacing) {
                RemoteExecutionBanner()

                VStack(alignment: .leading, spacing: 6) {
                    Text("Agents and fleet board")
                        .font(.title.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("Parallel work runs in isolated remote branches or provider tasks. Cards expose provider, runtime, branch, checks, cost precision, conflicts, and evidence.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                if !store.isConnected {
                    ConnectionRequiredView(
                        title: "Connect GitHub before starting agents",
                        description: "Agent sessions must be tied to real repositories, branches, and provider accounts.",
                        actionTitle: "Open Settings",
                        action: connectGitHub
                    )
                }

                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: KarabinerDesign.cardSpacing) {
                        ForEach(columns) { column in
                            FleetColumnView(
                                column: column,
                                sessions: sessions(for: column),
                                inspectEvidence: inspectEvidence(for:)
                            )
                                .frame(width: 340)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)

                FleetComparisonView(store: store)
            }
            .padding(KarabinerDesign.contentPadding)
        }
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button("Start Plan", systemImage: "list.bullet.clipboard") {
                    startPlan()
                }
                    .keyboardShortcut("p", modifiers: [.command])
                Button("Run Fleet", systemImage: "person.3.sequence") {
                    runFleet()
                }
                    .keyboardShortcut("f", modifiers: [.command, .shift])
            }
        }
        .accessibilityLabel("Agents and fleet board.")
    }

    private func sessions(for column: FleetColumn) -> [AgentSession] {
        store.agentSessions.filter { column.statuses.contains($0.status) }
    }

    private func startPlan() {
        guard store.isConnected else {
            connectGitHub()
            return
        }

        guard !store.workspaces.isEmpty else {
            store.presentNotice(
                title: "Open a workspace first",
                message: "Start Plan needs a real repository workspace. Open a GitHub repository from Workspaces before starting provider work."
            )
            return
        }

        store.presentNotice(
            title: "Start from a Workspace",
            message: "Open the Workspaces tab, tap a workspace card, and use \"Start Agent Session\" to send a prompt to the GitHub Copilot Agent Tasks API."
        )
    }

    private func runFleet() {
        guard store.isConnected else {
            connectGitHub()
            return
        }

        guard !store.workspaces.isEmpty else {
            store.presentNotice(
                title: "Open a workspace first",
                message: "Fleet runs must target real repository workspaces. Open a GitHub repository before comparing provider attempts."
            )
            return
        }

        store.presentNotice(
            title: "Fleet provider required",
            message: "Fleet execution is disabled until multiple real providers or runtimes are connected. Karabiner will not invent agent attempts."
        )
    }

    private func inspectEvidence(for session: AgentSession) {
        store.presentNotice(
            title: "Session evidence",
            message: session.reviewArtifactIDs.isEmpty
                ? "This provider session has not reported plans, diffs, checks, approvals, or logs yet."
                : "Evidence from this session is listed on the Review screen."
        )
    }
}

private struct FleetColumn: Identifiable {
    var id: String { title }
    var title: String
    var statuses: [AgentSessionStatus]
}

private struct FleetColumnView: View {
    var column: FleetColumn
    var sessions: [AgentSession]
    var inspectEvidence: (AgentSession) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
            HStack {
                Text(column.title)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(sessions.count)")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if sessions.isEmpty {
                ContentUnavailableView(
                    "No \(column.title.lowercased()) agents",
                    systemImage: "tray",
                    description: Text("Start with a plan-first task or compare remote provider attempts.")
                )
                .frame(minHeight: 220)
            } else {
                ForEach(sessions) { session in
                    AgentSessionCard(session: session) {
                        inspectEvidence(session)
                    }
                }
            }
        }
        .padding(KarabinerDesign.compactPadding)
        .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.cardCornerRadius))
        .accessibilityElement(children: .contain)
    }
}

private struct FleetComparisonView: View {
    @ObservedObject var store: KarabinerAppStore

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.contentPadding) {
                Label("Compare agent attempts", systemImage: "rectangle.split.3x1")
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)

                Text("Comparison keeps plans, diffs, checks, runtime health, and policy risks side by side before any merge.")
                    .font(.body)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                    if store.agentSessions.isEmpty {
                        ContentUnavailableView(
                            "No agent attempts",
                            systemImage: "rectangle.split.3x1",
                            description: Text("Provider attempts appear here after real remote sessions are started.")
                        )
                        .frame(minHeight: 180)
                    } else {
                        ForEach(store.agentSessions) { session in
                            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                                StatusChip(
                                    title: session.status.displayName,
                                    systemImage: session.status.systemImage,
                                    tint: session.status.tint
                                )
                                Text(session.promptSummary)
                                    .font(.headline)
                                LabeledContent("Provider", value: session.disclosure.providerName)
                                LabeledContent("Runtime", value: session.disclosure.runtimeName)
                                LabeledContent("Branch", value: session.disclosure.branchName)
                                LabeledContent("Billing", value: session.disclosure.billingPath.displayName)
                            }
                            .padding(KarabinerDesign.compactPadding)
                            .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    AgentFleetBoardView(store: KarabinerAppStore()) {}
}
