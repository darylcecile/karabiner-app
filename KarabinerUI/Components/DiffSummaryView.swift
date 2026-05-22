import KarabinerCore
import SwiftUI

struct DiffSummaryView: View {
    var diff: Diff
    var acceptHunk: () -> Void
    var comment: () -> Void
    var askAgent: () -> Void

    var body: some View {
        KarabinerCard {
            VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                Label("Diff review", systemImage: "plus.forwardslash.minus")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                HStack {
                    StatusChip(title: "+\(diff.totalAdditions) additions", systemImage: "plus", tint: .green)
                    StatusChip(title: "-\(diff.totalDeletions) deletions", systemImage: "minus", tint: .red)
                    StatusChip(title: diff.reviewState.rawValue, systemImage: "eye", tint: .indigo)
                }

                LabeledContent("Base", value: diff.baseRef)
                LabeledContent("Head", value: diff.headRef)
                if let mergeBaseSHA = diff.mergeBaseSHA {
                    LabeledContent("Merge base", value: mergeBaseSHA)
                }

                ForEach(diff.files) { file in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Label(file.path, systemImage: file.changeKind == .added ? "doc.badge.plus" : "doc.text")
                                .font(.subheadline.bold())
                            Spacer()
                            Text("+\(file.additions) −\(file.deletions)")
                                .font(.body.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }

                        if let firstHunk = file.hunks.first {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(firstHunk.header)
                                    .font(.footnote.monospaced())
                                    .foregroundStyle(.secondary)
                                ForEach(firstHunk.lines) { line in
                                    DiffLineRow(line: line)
                                }
                            }
                            .padding(KarabinerDesign.compactPadding)
                            .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Hunk \(firstHunk.header), \(file.additions) additions, \(file.deletions) deletions.")
                        }
                    }
                }

                HStack {
                    Button("Accept hunk", systemImage: "checkmark.circle", action: acceptHunk)
                        .buttonStyle(.borderedProminent)
                    Button("Comment", systemImage: "text.bubble", action: comment)
                        .buttonStyle(.bordered)
                    Button("Ask agent", systemImage: "sparkles", action: askAgent)
                        .buttonStyle(.bordered)
                }
                .frame(minHeight: KarabinerDesign.minimumHitSize)
            }
        }
        .accessibilityLabel("Diff from \(diff.baseRef) to \(diff.headRef), \(diff.totalAdditions) additions and \(diff.totalDeletions) deletions.")
    }
}

private struct DiffLineRow: View {
    var line: DiffLine

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(prefix)
                .font(.body.monospaced())
                .foregroundStyle(tint)
                .accessibilityHidden(true)

            Text(line.content)
                .font(.body.monospaced())
                .foregroundStyle(tint)
                .lineLimit(2)
        }
        .accessibilityLabel("\(kindLabel): \(line.content)")
    }

    private var prefix: String {
        switch line.kind {
        case .addition:
            "+"
        case .deletion:
            "−"
        case .context:
            " "
        case .hunkHeader:
            "@"
        }
    }

    private var kindLabel: String {
        switch line.kind {
        case .addition:
            "Addition"
        case .deletion:
            "Deletion"
        case .context:
            "Context"
        case .hunkHeader:
            "Hunk header"
        }
    }

    private var tint: Color {
        switch line.kind {
        case .addition:
            .green
        case .deletion:
            .red
        case .context, .hunkHeader:
            .primary
        }
    }
}
