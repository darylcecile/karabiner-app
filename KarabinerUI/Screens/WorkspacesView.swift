import KarabinerCore
import SwiftUI

struct WorkspacesView: View {
    @ObservedObject var store: KarabinerAppStore
    var connectGitHub: () -> Void
    @State private var isSearchVisible = false
    @State private var repositorySearchText = ""
    @State private var selectedWorkspace: Workspace?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: KarabinerDesign.sectionSpacing) {
                RemoteExecutionBanner()

                VStack(alignment: .leading, spacing: 6) {
                    Text("Workspaces and repositories")
                        .font(.title.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("Repositories are loaded from GitHub. Workspaces are created only when you open a real repository.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                if !store.isConnected {
                    ConnectionRequiredView(
                        title: "Connect GitHub",
                        description: "Workspaces require authenticated repository data. Connect GitHub to load the repositories your token can access.",
                        actionTitle: "Open Settings",
                        action: connectGitHub
                    )
                }

                repositoriesContent

                workspaceContent
            }
            .padding(KarabinerDesign.contentPadding)
        }
        .scrollIndicators(.hidden)
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button("Open Repository", systemImage: "folder.badge.plus") {
                    openFirstAvailableRepository()
                }
                    .keyboardShortcut("o", modifiers: [.command])
                Button(isSearchVisible ? "Hide Search" : "Search", systemImage: "magnifyingglass") {
                    withAnimation {
                        isSearchVisible.toggle()
                        if !isSearchVisible {
                            repositorySearchText = ""
                        }
                    }
                }
                    .keyboardShortcut("f", modifiers: [.command])
            }
        }
        .sheet(item: $selectedWorkspace) { workspace in
            WorkspaceDetailSheet(store: store, workspace: workspace)
        }
        .accessibilityLabel("Workspaces and repositories screen.")
    }

    @ViewBuilder
    private var repositoriesContent: some View {
        VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
            Text("Repositories")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)

            if isSearchVisible {
                TextField("Search repositories", text: $repositorySearchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                    .accessibilityHint("Filters the loaded GitHub repository list by owner or name.")
            }

            if store.phase.isLoading {
                ProgressView("Loading repositories")
                    .frame(maxWidth: .infinity, minHeight: 160)
            } else if filteredRepositories.isEmpty {
                ContentUnavailableView(
                    store.repositories.isEmpty ? "No repositories loaded" : "No matching repositories",
                    systemImage: "folder",
                    description: Text(repositoryEmptyDescription)
                )
                .frame(minHeight: 180)
            } else {
                LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                    ForEach(filteredRepositories) { repository in
                        RepositoryCard(repository: repository) {
                            selectedWorkspace = store.openWorkspace(for: repository)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var workspaceContent: some View {
        VStack(alignment: .leading, spacing: KarabinerDesign.compactPadding) {
            Text("Open workspaces")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)

            if store.workspaces.isEmpty {
                ContentUnavailableView(
                    "No open workspaces",
                    systemImage: "rectangle.3.group",
                    description: Text("Open a repository to create a workspace. Karabiner does not pre-fill this list.")
                )
                .frame(minHeight: 180)
            } else {
                LazyVGrid(columns: KarabinerDesign.cardGridColumns, spacing: KarabinerDesign.cardSpacing) {
                    ForEach(store.workspaces) { workspace in
                        WorkspaceCard(workspace: workspace) {
                            selectedWorkspace = workspace
                        }
                    }
                }
            }
        }
    }

    private var filteredRepositories: [GitHubRepository] {
        let trimmedSearch = repositorySearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSearch.isEmpty else {
            return store.repositories
        }
        return store.repositories.filter { repository in
            repository.fullName.localizedCaseInsensitiveContains(trimmedSearch)
                || repository.defaultBranch.localizedCaseInsensitiveContains(trimmedSearch)
        }
    }

    private var repositoryEmptyDescription: String {
        if !store.isConnected {
            return "Connect GitHub to load repositories."
        }
        if store.repositories.isEmpty {
            return "GitHub returned no repositories for this token."
        }
        return "Clear the repository search to show all loaded repositories."
    }

    private func openFirstAvailableRepository() {
        guard store.isConnected else {
            connectGitHub()
            return
        }

        guard let repository = filteredRepositories.first(where: { !$0.isArchived }) else {
            store.presentNotice(
                title: "No repository available",
                message: store.repositories.isEmpty
                    ? "Connect GitHub with a token that can read repository metadata before opening a workspace."
                    : "No loaded repository matches the current search or every matching repository is archived."
            )
            return
        }

        selectedWorkspace = store.openWorkspace(for: repository)
    }
}

private struct WorkspaceDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: KarabinerAppStore
    var workspace: Workspace

    @State private var showLaunchSheet = false

    var body: some View {
        NavigationStack {
            List {
                Section("Repository") {
                    LabeledContent("Name", value: workspace.repositoryFullName)
                    LabeledContent("Branch", value: workspace.branchName)
                    LabeledContent("State", value: workspace.state.displayName)
                }

                Section("Cache") {
                    LabeledContent("Cached files", value: "\(workspace.cacheSummary.fileCount)")
                    LabeledContent("Drafts", value: "\(workspace.cacheSummary.dirtyDraftCount)")
                    LabeledContent("Index", value: workspace.cacheSummary.isSearchIndexFresh ? "Fresh" : "Needs refresh")
                }

                Section("Agent Session") {
                    if workspace.activeAgentSessionIDs.isEmpty {
                        Text("No active sessions for this workspace.")
                            .foregroundStyle(.secondary)
                    } else {
                        LabeledContent("Active sessions", value: "\(workspace.activeAgentSessionIDs.count)")
                    }

                    Button {
                        showLaunchSheet = true
                    } label: {
                        Label("Start Agent Session", systemImage: "play.circle")
                    }
                    .disabled(!store.isConnected)
                    .accessibilityHint(store.isConnected
                        ? "Opens a form to enter a prompt and start a GitHub Copilot agent task."
                        : "Requires GitHub connection. Connect in Settings first.")
                }
            }
            .navigationTitle("Workspace")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showLaunchSheet) {
                AgentSessionLaunchSheet(store: store, workspace: workspace)
            }
        }
    }
}

private struct AgentSessionLaunchSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: KarabinerAppStore
    var workspace: Workspace

    @State private var prompt = ""
    @State private var model = ""
    @State private var createPR = true
    @State private var isLaunching = false
    @State private var localError: String?

    private var trimmedPrompt: String { prompt.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSubmit: Bool { !trimmedPrompt.isEmpty && !isLaunching }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $prompt)
                        .frame(minHeight: 120)
                        .accessibilityLabel("Agent task prompt")
                        .accessibilityHint("Describe the work you want the GitHub Copilot agent to perform.")
                } header: {
                    Text("Prompt")
                } footer: {
                    Text("Sent verbatim to the GitHub Copilot Agent Tasks API for \(workspace.repositoryFullName).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Options") {
                    TextField("Model (optional, e.g. gpt-4o)", text: $model)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityHint("Leave blank to use the Copilot provider default.")
                    Toggle("Create pull request on completion", isOn: $createPR)
                }

                Section("Provider") {
                    LabeledContent("Provider", value: "GitHub Copilot cloud agent")
                    LabeledContent("Runtime", value: "GitHub-hosted")
                    LabeledContent("Repository", value: workspace.repositoryFullName)
                    LabeledContent("Base branch", value: workspace.baseBranchName ?? workspace.branchName)
                }

                if isLaunching {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Starting agent session…")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let error = localError {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                            .accessibilityLabel("Error: \(error)")
                    }
                }
            }
            .navigationTitle("Start Agent Session")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isLaunching)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") { launchSession() }
                        .disabled(!canSubmit)
                }
            }
        }
    }

    private func launchSession() {
        isLaunching = true
        localError = nil
        let trimmedModel: String? = model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil
            : model.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await store.startAgentSession(
                from: workspace,
                prompt: trimmedPrompt,
                model: trimmedModel,
                createPR: createPR
            )
            isLaunching = false
            if let error = store.sessionLaunchError {
                localError = error
            } else {
                dismiss()
            }
        }
    }
}

#Preview {
    WorkspacesView(store: KarabinerAppStore()) {}
}
