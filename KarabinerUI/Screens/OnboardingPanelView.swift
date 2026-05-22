import SwiftUI

struct OnboardingPanelView: View {
    var openSettings: () -> Void
    @State private var isDismissed = false

    private let steps = [
        ("Connect GitHub", "Use native web auth and least-privilege repository access.", "person.crop.circle.badge.checkmark"),
        ("Choose provider", "Pick Copilot, Claude, Codex, OpenCode, Codespaces, or a trusted runtime only where official auth permits it.", "sparkles.rectangle.stack"),
        ("Review plan", "See provider, runtime, account, billing path, branch, capabilities, and limits before launch.", "list.bullet.clipboard"),
        ("Approve remote work", "Builds, tests, installs, previews, and deployments happen remotely and remain visible through logs, checks, and diffs.", "checkmark.shield")
    ]

    var body: some View {
        if !isDismissed {
            KarabinerCard {
                VStack(alignment: .leading, spacing: KarabinerDesign.contentPadding) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Build, review, and steer agent work from iPad")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)

                        Text("Karabiner stays empty until you connect real accounts, repositories, and remote runtimes.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    ForEach(steps, id: \.0) { step in
                        Label {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(step.0)
                                    .font(.headline)
                                Text(step.1)
                                    .font(.body)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: step.2)
                                .foregroundStyle(.blue)
                        }
                        .accessibilityElement(children: .combine)
                    }

                    HStack {
                        Button("Open Settings", systemImage: "gear", action: openSettings)
                            .buttonStyle(.borderedProminent)
                            .keyboardShortcut("t", modifiers: [.command])

                        Button("Connect later", systemImage: "clock") {
                            isDismissed = true
                        }
                        .buttonStyle(.bordered)
                        .accessibilityHint("Dismisses this onboarding panel for the current app session.")
                    }
                    .frame(minHeight: KarabinerDesign.minimumHitSize)
                }
            }
            .accessibilityLabel("Onboarding. Explains GitHub connection, provider choice, plan review, and remote approval.")
        }
    }
}

#Preview {
    OnboardingPanelView {}
        .padding()
}
