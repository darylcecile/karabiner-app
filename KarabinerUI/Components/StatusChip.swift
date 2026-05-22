import SwiftUI

struct StatusChip: View {
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

    var title: String
    var systemImage: String
    var tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.footnote)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(tint)
            .background {
                Capsule()
                    .fill(tint.opacity(differentiateWithoutColor ? 0.08 : 0.14))
            }
            .overlay(alignment: .center) {
                Capsule()
                    .stroke(tint, lineWidth: differentiateWithoutColor ? 1.5 : 0)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(title)
    }
}
