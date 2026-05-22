import KarabinerCore
import SwiftUI

struct CheckRunCard: View {
    var checkRun: CheckRun
    var openLogs: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(checkRun.name)
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)

                        Text(checkRun.source.displayName)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    StatusChip(
                        title: checkRun.displayName,
                        systemImage: checkRun.systemImage,
                        tint: checkRun.tint
                    )
                }

                LabeledContent("Annotations", value: "\(checkRun.annotationsCount)")

                Button("Open Logs", systemImage: "doc.text.magnifyingglass", action: openLogs)
                    .buttonStyle(.bordered)
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                    .accessibilityHint("Opens remote check logs from the provider.")
            }
        }
        .accessibilityLabel("\(checkRun.name), \(checkRun.displayName), source \(checkRun.source.displayName), \(checkRun.annotationsCount) annotations.")
    }
}
