import KarabinerCore
import SwiftUI

struct ApprovalRequestCard: View {
    var approval: ApprovalRequest
    var approve: () -> Void
    var deny: () -> Void
    var requestSaferPlan: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(approval.action)
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)

                        Text(approval.rationale)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: KarabinerDesign.compactPadding)

                    StatusChip(
                        title: approval.riskTier.displayName,
                        systemImage: approval.riskTier.systemImage,
                        tint: approval.riskTier.tint
                    )
                }

                LabeledContent("Branch", value: approval.branchName)
                LabeledContent("Policy", value: approval.policyDecision.outcome.rawValue)

                if let exactCommand = approval.exactCommandOrAPICall {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Exact command or API call")
                            .font(.subheadline.bold())
                        Text(exactCommand)
                            .font(.body.monospaced())
                            .textSelection(.enabled)
                            .padding(KarabinerDesign.compactPadding)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Affected resources")
                        .font(.subheadline.bold())
                    ForEach(approval.affectedResources) { resource in
                        Label(resource.displayName, systemImage: resource.isSensitive ? "lock.trianglebadge.exclamationmark" : "target")
                            .font(.footnote)
                            .foregroundStyle(resource.isSensitive ? .red : .secondary)
                    }
                }

                HStack {
                    Button("Approve", systemImage: "checkmark", action: approve)
                        .buttonStyle(.borderedProminent)
                        .disabled(!approval.policyDecision.permitsExecution)
                        .accessibilityHint(approval.policyDecision.permitsExecution ? "Approves the request." : "Policy blocks approval.")

                    Button("Deny", systemImage: "xmark", action: deny)
                        .buttonStyle(.bordered)

                    Button("Ask for safer plan", systemImage: "arrow.uturn.backward", action: requestSaferPlan)
                        .buttonStyle(.bordered)
                }
                .controlSize(.regular)
                .frame(minHeight: KarabinerDesign.minimumHitSize)
            }
        }
        .accessibilityLabel("\(approval.action). \(approval.riskTier.displayName). Status \(approval.status.displayName). Branch \(approval.branchName).")
    }
}
