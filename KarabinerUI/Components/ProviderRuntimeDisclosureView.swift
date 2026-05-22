import KarabinerCore
import SwiftUI

struct ProviderRuntimeDisclosureView: View {
    var disclosure: AgentSessionDisclosure

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                Label("Provider disclosure", systemImage: "checkmark.seal.text.page")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                LabeledContent("Provider", value: disclosure.providerName)
                LabeledContent("Runtime", value: disclosure.runtimeName)
                LabeledContent("Account", value: disclosure.accountLabel)
                LabeledContent("Billing", value: disclosure.billingPath.displayName)
                LabeledContent("Branch", value: disclosure.branchName)
                LabeledContent("Streaming", value: disclosure.canClaimStreaming ? "Realtime available" : "Polling or handoff")

                if !disclosure.limitations.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Limitations")
                            .font(.subheadline.bold())
                        ForEach(disclosure.limitations, id: \.self) { limitation in
                            Label(limitation, systemImage: "exclamationmark.triangle")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .accessibilityLabel("Provider disclosure for \(disclosure.providerName), runtime \(disclosure.runtimeName), account \(disclosure.accountLabel), billing \(disclosure.billingPath.displayName), branch \(disclosure.branchName).")
    }
}
