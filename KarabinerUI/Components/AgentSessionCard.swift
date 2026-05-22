import KarabinerCore
import SwiftUI

struct AgentSessionCard: View {
    var session: AgentSession
    var inspectEvidence: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(session.promptSummary)
                            .font(.headline)
                            .lineLimit(3)
                            .accessibilityAddTraits(.isHeader)

                        Text(session.mode.displayName)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: KarabinerDesign.compactPadding)

                    StatusChip(
                        title: session.status.displayName,
                        systemImage: session.status.systemImage,
                        tint: session.status.tint
                    )
                }

                ProviderRuntimeDisclosureView(disclosure: session.disclosure)
                    .padding(.vertical, 4)

                HStack {
                    StatusChip(
                        title: session.disclosure.providerKind.displayName,
                        systemImage: "sparkles",
                        tint: .blue
                    )
                    StatusChip(
                        title: session.disclosure.runtimeName,
                        systemImage: "server.rack",
                        tint: .teal
                    )
                }

                if let budgetImpact = session.budgetImpact {
                    Label(
                        budgetImpact.mustShowPrecisionWarning ? "Usage estimate only" : "Usage reported by provider",
                        systemImage: budgetImpact.mustShowPrecisionWarning ? "exclamationmark.triangle" : "chart.bar"
                    )
                    .font(.footnote)
                    .foregroundStyle(budgetImpact.mustShowPrecisionWarning ? .orange : .secondary)
                }

                Button("Inspect Evidence", systemImage: "doc.text.magnifyingglass", action: inspectEvidence)
                    .buttonStyle(.bordered)
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                    .accessibilityHint("Shows plans, diffs, checks, approvals, and logs for this session.")
            }
        }
        .accessibilityLabel("\(session.promptSummary). Status \(session.status.displayName). Provider \(session.disclosure.providerName). Runtime \(session.disclosure.runtimeName). Branch \(session.disclosure.branchName).")
    }
}
