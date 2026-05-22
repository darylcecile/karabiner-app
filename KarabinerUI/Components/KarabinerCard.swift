import SwiftUI

struct KarabinerCard<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(KarabinerDesign.contentPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: .rect(cornerRadius: KarabinerDesign.cardCornerRadius))
            .overlay(alignment: .center) {
                RoundedRectangle(cornerRadius: KarabinerDesign.cardCornerRadius)
                    .stroke(.quaternary, lineWidth: 1)
            }
            .accessibilityElement(children: .contain)
    }
}
