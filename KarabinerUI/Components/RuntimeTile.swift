import KarabinerCore
import SwiftUI

struct RuntimeTile: View {
    var runtime: ExecutionRuntimeDescriptor
    var openTrustControls: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(runtime.displayName)
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)

                        Text(runtime.kind.rawValue)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    StatusChip(
                        title: runtime.health.displayName,
                        systemImage: runtime.health.systemImage,
                        tint: runtime.health.tint
                    )
                }

                LabeledContent("Trust", value: runtime.trustLevel.rawValue)
                LabeledContent("Account", value: runtime.accountLabel ?? "Not connected")
                LabeledContent("Repo scope", value: runtime.repositoryScope.isEmpty ? "None" : runtime.repositoryScope.joined(separator: ", "))
                LabeledContent("Network", value: runtime.networkPolicy.mode.rawValue)
                LabeledContent("Secrets", value: runtime.secretPolicy.mode.rawValue)

                ScrollView(.horizontal) {
                    HStack {
                        ForEach(runtime.capabilities.sorted(by: { $0.displayName < $1.displayName }), id: \.self) { capability in
                            StatusChip(
                                title: capability.displayName,
                                systemImage: "checkmark",
                                tint: capability.defaultRiskTier.tint
                            )
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)

                Button("Trust and revoke controls", systemImage: "lock.shield", action: openTrustControls)
                    .buttonStyle(.bordered)
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                    .accessibilityHint("Shows connection trust, revocation, and audit controls for this runtime.")
            }
        }
        .accessibilityLabel("\(runtime.displayName), \(runtime.health.displayName), trust \(runtime.trustLevel.rawValue), account \(runtime.accountLabel ?? "not connected").")
    }
}
