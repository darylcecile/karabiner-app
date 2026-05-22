import SwiftUI

struct MetricCard: View {
    var title: String
    var value: String
    var detail: String
    var systemImage: String
    var tint: Color

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                Label(title, systemImage: systemImage)
                    .font(.headline)
                    .foregroundStyle(tint)

                Text(value)
                    .font(.largeTitle.bold())
                    .contentTransition(.numericText())
                    .accessibilityAddTraits(.isHeader)

                Text(detail)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityLabel("\(title): \(value). \(detail)")
    }
}
