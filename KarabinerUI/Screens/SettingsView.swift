import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: KarabinerAppStore
    @State private var githubToken = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: KarabinerDesign.sectionSpacing) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Settings and administration")
                        .font(.title.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("Connect real providers and runtimes. Karabiner stores credentials in Keychain and only shows data loaded from connected services.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                if case .failed(let message) = store.phase {
                    KarabinerCard {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityLabel("Error: \(message)")
                    }
                }

                KarabinerCard {
                    VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                        Label("GitHub account", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)

                        if let connection = store.githubConnection {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(connection.account.login)
                                        .font(.headline)
                                    Spacer()
                                    StatusChip(
                                        title: connection.authState.rawValue,
                                        systemImage: connection.authState.canStartSession ? "checkmark.circle" : "exclamationmark.circle",
                                        tint: connection.authState.canStartSession ? .green : .orange
                                    )
                                }
                                LabeledContent("Display name", value: connection.account.displayName ?? "Not provided")
                                LabeledContent("Repositories", value: "\(store.repositories.count)")
                                LabeledContent("Token scopes", value: connection.tokenScopes.isEmpty ? "Not reported" : connection.tokenScopes.sorted().joined(separator: ", "))
                                LabeledContent("Last validated", value: connection.lastValidatedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Never")
                            }
                            .padding(KarabinerDesign.compactPadding)
                            .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
                            .accessibilityElement(children: .combine)
                        } else {
                            Text("No GitHub account connected.")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }

                        SecureField("GitHub fine-grained token", text: $githubToken)
                            .textContentType(.password)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .accessibilityHint("Paste a GitHub user access token. It is stored in Keychain and used to call the GitHub REST API.")

                        Text("Use a GitHub fine-grained token or GitHub App user access token with repository metadata access. OAuth token exchange should replace this field once the app's GitHub OAuth client is configured.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        HStack {
                            Button(store.isConnected ? "Replace Token" : "Connect GitHub", systemImage: "key") {
                                Task {
                                    await store.connectGitHub(accessToken: githubToken)
                                    githubToken = ""
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(githubToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.phase.isLoading)

                            Button("Refresh", systemImage: "arrow.clockwise") {
                                Task { await store.load() }
                            }
                            .buttonStyle(.bordered)
                            .disabled(store.phase.isLoading)

                            Button("Disconnect", systemImage: "trash") {
                                Task { await store.disconnectGitHub() }
                            }
                            .buttonStyle(.bordered)
                            .tint(.red)
                            .disabled(!store.canDisconnectGitHub || store.phase.isLoading)
                        }
                        .frame(minHeight: KarabinerDesign.minimumHitSize)
                    }
                }

                VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                    Text("Runtime Center")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)

                    LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                        if store.runtimes.isEmpty {
                            ContentUnavailableView(
                                "No runtimes connected",
                                systemImage: "server.rack",
                                description: Text("Remote runtimes appear here after they are connected and validated.")
                            )
                            .frame(minHeight: 160)
                        } else {
                            ForEach(store.runtimes) { runtime in
                                RuntimeTile(runtime: runtime) {
                                    store.presentNotice(
                                        title: "Runtime controls",
                                        message: "Trust and revocation controls require the connected runtime provider to expose a management endpoint."
                                    )
                                }
                            }
                        }
                    }
                }

                KarabinerCard {
                    VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                        Label("Policies and privacy", systemImage: "lock.shield")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)

                        LabeledContent("Default agent mode", value: "Plan first")
                        LabeledContent("Execution policy", value: "Remote or trusted user-owned runtimes only")
                        LabeledContent("Secret handling", value: "Handles only; reveal requires approval")
                        LabeledContent("Prompt retention", value: "No prompts retained until a real provider session is connected")
                        LabeledContent("Billing precision", value: "Never claims exact cost unless provider reports it")

                        HStack {
                            ShareLink(
                                item: store.auditLogText,
                                subject: Text("Karabiner audit log")
                            ) {
                                Label("Export audit log", systemImage: "square.and.arrow.up")
                            }
                                .buttonStyle(.bordered)
                            Button("Delete local cache", systemImage: "trash") {
                                store.deleteLocalCache()
                                store.presentNotice(
                                    title: "Local cache deleted",
                                    message: "Cached workspaces, sessions, approvals, checks, artifacts, logs, and runtime entries were removed. Connected GitHub account and repository metadata were kept."
                                )
                            }
                                .buttonStyle(.bordered)
                                .tint(.red)
                        }
                        .frame(minHeight: KarabinerDesign.minimumHitSize)
                    }
                }

                KarabinerCard {
                    VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
                        Label("Keyboard shortcuts", systemImage: "keyboard")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)

                        ShortcutRow(keys: "⌘K", action: "Command palette")
                        ShortcutRow(keys: "⌘N", action: "New plan")
                        ShortcutRow(keys: "⌘O", action: "Open repository")
                        ShortcutRow(keys: "⌘⇧F", action: "Run fleet")
                        ShortcutRow(keys: "⌘↩", action: "Approve selected review")
                    }
                }
            }
            .padding(KarabinerDesign.contentPadding)
        }
        .scrollIndicators(.hidden)
        .accessibilityLabel("Settings and administration screen.")
    }
}

private struct ShortcutRow: View {
    var keys: String
    var action: String

    var body: some View {
        LabeledContent {
            Text(action)
                .font(.body)
        } label: {
            Text(keys)
                .font(.body.monospaced().bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.thinMaterial, in: .rect(cornerRadius: KarabinerDesign.chipCornerRadius))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(keys), \(action)")
    }
}

#Preview {
    SettingsView(store: KarabinerAppStore())
}
