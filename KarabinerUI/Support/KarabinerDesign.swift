import SwiftUI

enum KarabinerDesign {
    static let minimumHitSize: CGFloat = 44
    static let cardCornerRadius: CGFloat = 22
    static let chipCornerRadius: CGFloat = 12
    static let cardSpacing: CGFloat = 16
    static let sectionSpacing: CGFloat = 24
    static let contentPadding: CGFloat = 20
    static let compactPadding: CGFloat = 12
    static let cardGridColumns = [
        GridItem(.adaptive(minimum: 280), spacing: cardSpacing, alignment: .top)
    ]
}
