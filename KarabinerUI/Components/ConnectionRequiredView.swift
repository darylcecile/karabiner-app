import SwiftUI

struct ConnectionRequiredView: View {
    var title: String
    var description: String
    var actionTitle: String
    var action: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "person.crop.circle.badge.exclamationmark")
        } description: {
            Text(description)
        } actions: {
            Button(actionTitle, systemImage: "person.crop.circle.badge.checkmark", action: action)
                .buttonStyle(.borderedProminent)
                .frame(minHeight: KarabinerDesign.minimumHitSize)
        }
        .accessibilityElement(children: .contain)
    }
}
