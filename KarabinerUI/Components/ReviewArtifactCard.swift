import KarabinerCore
import SwiftUI

struct ReviewArtifactCard: View {
    var artifact: ReviewableArtifact
    var openArtifact: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack {
                    Label(artifact.kind.displayName, systemImage: artifact.kind.systemImage)
                        .font(.subheadline.bold())
                        .foregroundStyle(.secondary)

                    Spacer()

                    StatusChip(
                        title: artifact.riskTier.displayName,
                        systemImage: artifact.riskTier.systemImage,
                        tint: artifact.riskTier.tint
                    )
                }

                Text(artifact.title)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Text("State: \(artifact.state.rawValue)")
                    .font(.body)
                    .foregroundStyle(.secondary)

                Button("Open Artifact", systemImage: "doc.text.magnifyingglass", action: openArtifact)
                    .buttonStyle(.bordered)
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                    .accessibilityHint("Opens this reviewable artifact.")
            }
        }
        .accessibilityLabel("\(artifact.kind.displayName), \(artifact.title), \(artifact.riskTier.displayName), state \(artifact.state.rawValue).")
    }
}
