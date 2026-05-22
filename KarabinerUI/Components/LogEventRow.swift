import KarabinerCore
import SwiftUI

struct LogEventRow: View {
    var event: LogEvent

    var body: some View {
        HStack(alignment: .top, spacing: KarabinerDesign.compactPadding) {
            Image(systemName: symbolName)
                .foregroundStyle(tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(event.source.displayName)
                        .font(.subheadline.bold())

                    Text("#\(event.sequence)")
                        .font(.body.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                Text(event.message)
                    .font(.body.monospaced())
                    .textSelection(.enabled)

                if event.isRedacted {
                    Label("Redacted sensitive content", systemImage: "lock")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding(KarabinerDesign.compactPadding)
        .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(event.severity.rawValue) log from \(event.source.displayName): \(event.message)")
    }

    private var symbolName: String {
        switch event.severity {
        case .trace, .debug:
            "ladybug"
        case .info:
            "info.circle"
        case .warning:
            "exclamationmark.triangle"
        case .error, .critical:
            "xmark.octagon"
        }
    }

    private var tint: Color {
        switch event.severity {
        case .trace, .debug, .info:
            .blue
        case .warning:
            .orange
        case .error, .critical:
            .red
        }
    }
}
