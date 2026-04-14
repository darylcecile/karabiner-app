import AppKit
import Foundation

@MainActor
final class MainViewController: NSViewController {
    var onModeChange: ((ContentMode) -> Void)?
    var onTitleChange: ((String, URL?) -> Void)?
    var onQuickOpenSnapshotChange: ((QuickOpenSnapshot) -> Void)?

    private let paths: AppPaths
    private let configStore: ConfigStore
    private let vaultIndex: VaultIndex
    private let assetIndex: AssetIndex
    private let splitController = MainSplitViewController()
    private let sidebarController = SidebarViewController()
    private let contentController = ContentContainerViewController()
    private let statusBar = StatusBarView()
    private let backgroundEffectView = NSVisualEffectView()
    private let backgroundTintView = NSView()
    private let documentSession = DocumentSession()
    private var workspaceStream: WorkspaceEventStream?
    private var config = AppConfig.default
    private var nodes: [VaultNode] = []
    private var assets: [AssetItem] = []
    private var quickOpenState = QuickOpenSnapshot(items: [])
    private var currentMode: ContentMode = .vault
    private var selectedDocumentURL: URL?
    private var hasStarted = false

    init(paths: AppPaths, configStore: ConfigStore, vaultIndex: VaultIndex, assetIndex: AssetIndex) {
        self.paths = paths
        self.configStore = configStore
        self.vaultIndex = vaultIndex
        self.assetIndex = assetIndex
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureLayout()
        bindControllers()
        sidebarController.setRootDisplayPath((paths.vaultURL.path as NSString).abbreviatingWithTildeInPath)
    }

    func start() {
        guard !hasStarted else {
            return
        }

        hasStarted = true
        reloadWorkspace(.initial, preserveSelection: false)

        let stream = WorkspaceEventStream(appPaths: paths) { [weak self] changeSet in
            self?.reloadWorkspace(changeSet, preserveSelection: true)
        }
        workspaceStream = stream
        stream.start()
    }

    func stop() {
        documentSession.close()
        workspaceStream?.stop()
        workspaceStream = nil
    }

    func setContentMode(_ mode: ContentMode) {
        guard currentMode != mode else {
            refreshVisibleContent()
            return
        }

        if currentMode == .vault && mode != .vault {
            documentSession.flushAutosave()
        }

        currentMode = mode
        SessionStore.saveContentMode(mode)
        onModeChange?(mode)
        refreshVisibleContent(animated: true)
    }

    func toggleSidebar() {
        splitController.toggleSidebar()
    }

    func performNewCollection(parent node: VaultNode? = nil) {
        guard let draft = presentCollectionSheet(existing: nil) else {
            return
        }

        let targetFolder = parentFolder(for: node)
        let url = FileSystemWriter.uniqueDirectory(in: targetFolder, baseName: draft.name)

        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            if draft.style.sfSymbol != nil || draft.style.tintHex != nil {
                try FileSystemWriter.writeCollectionStyle(draft.style, to: url)
            }
            reloadWorkspace(WorkspaceChangeSet(vaultTreeChanged: true), preserveSelection: false)
            sidebarController.select(url: url)
        } catch {
            present(error: error, message: "Unable to create collection")
        }
    }

    func performNewNote(parent node: VaultNode? = nil) {
        guard let noteName = presentNoteSheet() else {
            return
        }

        let targetFolder = parentFolder(for: node)
        let url = FileSystemWriter.uniqueMarkdownFile(in: targetFolder, baseName: noteName)
        let contents = "# \(url.deletingPathExtension().lastPathComponent)\n\n"

        do {
            try contents.write(to: url, atomically: true, encoding: .utf8)
            reloadWorkspace(WorkspaceChangeSet(vaultTreeChanged: true), preserveSelection: false)
            open(route: .note(url))
            contentController.focusEditor()
        } catch {
            present(error: error, message: "Unable to create note")
        }
    }

    func open(route: AppRoute) {
        switch route {
        case let .note(url):
            sidebarController.select(url: url)
            currentMode = .vault
            onModeChange?(currentMode)
            openDocument(at: url, animated: true)

        case let .collection(url):
            sidebarController.select(url: url)
            currentMode = .vault
            onModeChange?(currentMode)
            refreshVisibleContent(animated: true)

        case let .asset(url):
            currentMode = .gallery
            onModeChange?(currentMode)
            refreshVisibleContent(animated: true)
            contentController.selectAsset(at: url)
        }
    }

    func currentQuickOpenSnapshot() -> QuickOpenSnapshot {
        quickOpenState
    }

    func openSelectedAsset() {
        contentController.openSelectedAsset()
    }

    func revealSelectedAsset() {
        contentController.revealSelectedAsset()
    }

    func toggleQuickLook() {
        contentController.toggleQuickLook()
    }

    private func configureLayout() {
        backgroundEffectView.material = .underWindowBackground
        backgroundEffectView.blendingMode = .behindWindow
        backgroundEffectView.state = .followsWindowActiveState
        backgroundEffectView.translatesAutoresizingMaskIntoConstraints = false

        backgroundTintView.translatesAutoresizingMaskIntoConstraints = false
        backgroundTintView.wantsLayer = true

        addChild(splitController)
        splitController.configure(sidebarController: sidebarController, contentController: contentController)
        splitController.view.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(backgroundEffectView)
        view.addSubview(backgroundTintView)
        view.addSubview(splitController.view)
        view.addSubview(statusBar)

        NSLayoutConstraint.activate([
            backgroundEffectView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backgroundEffectView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backgroundEffectView.topAnchor.constraint(equalTo: view.topAnchor),
            backgroundEffectView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            backgroundTintView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backgroundTintView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backgroundTintView.topAnchor.constraint(equalTo: view.topAnchor),
            backgroundTintView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            splitController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splitController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            splitController.view.topAnchor.constraint(equalTo: view.topAnchor),
            splitController.view.bottomAnchor.constraint(equalTo: statusBar.topAnchor),

            statusBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            statusBar.heightAnchor.constraint(equalToConstant: 34),
        ])
    }

    private func bindControllers() {
        sidebarController.onSelection = { [weak self] node in
            self?.handleSidebarSelection(node)
        }
        sidebarController.onNewCollection = { [weak self] node in
            self?.performNewCollection(parent: node)
        }
        sidebarController.onNewNote = { [weak self] node in
            self?.performNewNote(parent: node)
        }
        sidebarController.onCustomizeCollection = { [weak self] node in
            self?.customizeCollection(node)
        }
        sidebarController.onReveal = { node in
            NSWorkspace.shared.activateFileViewerSelecting([node.url])
        }

        contentController.onMetricsChange = { [weak self] metrics in
            self?.statusBar.setMetrics(metrics)
        }
        contentController.onContextChange = { [weak self] context in
            self?.statusBar.setContext(context)
        }
        contentController.onDocumentReloadRequest = { [weak self] in
            guard let self else {
                return
            }
            try? self.documentSession.reloadFromDisk()
        }
        contentController.onDocumentOverwriteRequest = { [weak self] in
            self?.documentSession.overwriteDisk()
        }
        contentController.onDocumentTextChange = { [weak self] text in
            self?.documentSession.applyTextChange(text)
        }
        contentController.onGallerySelectionChange = { [weak self] asset in
            self?.statusBar.setStatusText(asset?.displayName ?? "\(self?.assets.count ?? 0) assets")
        }
        contentController.onDocumentOpenRequest = { [weak self] url in
            self?.open(route: .note(url))
        }
        contentController.onCollectionOpenRequest = { [weak self] url in
            self?.open(route: .collection(url))
        }

        documentSession.onReloadText = { [weak self] text in
            guard let self, let url = self.documentSession.currentURL else {
                return
            }
            self.contentController.showDocument(text: text, at: url, animated: false)
        }
        documentSession.onSnapshotChange = { [weak self] snapshot in
            self?.contentController.applyDocumentSnapshot(snapshot)
            self?.statusBar.setStatusText(snapshot.saveState.statusText)
        }
    }

    private func reloadWorkspace(_ changeSet: WorkspaceChangeSet, preserveSelection: Bool) {
        let previousSelection = preserveSelection ? (sidebarController.selectedNode?.url ?? selectedDocumentURL ?? SessionStore.loadSelectedDocumentURL()) : SessionStore.loadSelectedDocumentURL()

        if changeSet.configChanged {
            let loadedConfig = configStore.load()
            config = loadedConfig
            if !preserveSelection {
                currentMode = SessionStore.loadContentMode(default: loadedConfig.defaultContentMode)
                onModeChange?(currentMode)
            }
            apply(config: loadedConfig)
        } else if !preserveSelection {
            currentMode = SessionStore.loadContentMode(default: config.defaultContentMode)
            onModeChange?(currentMode)
        }

        if changeSet.vaultTreeChanged || changeSet == .initial {
            nodes = vaultIndex.buildTree(vaultURL: paths.vaultURL)
            let preferredSelection = resolvedSelection(from: previousSelection)
            selectedDocumentURL = preferredSelection?.kind == .document ? preferredSelection?.url : nil
            sidebarController.render(nodes: nodes, selectedURL: preferredSelection?.url)
            if let preferredSelection {
                sidebarController.select(url: preferredSelection.url)
            }
        }

        if changeSet.assetsChanged || changeSet == .initial {
            assets = assetIndex.buildAssets(assetsURL: paths.assetsURL)
        }

        if !changeSet.documentContentChangedURLs.isEmpty {
            documentSession.handleWorkspaceContentChange(changeSet.documentContentChangedURLs)
        }

        quickOpenState = QuickOpenIndexer.makeSnapshot(nodes: nodes, assets: assets, paths: paths)
        onQuickOpenSnapshotChange?(quickOpenState)
        refreshVisibleContent()
    }

    private func apply(config: AppConfig) {
        view.appearance = config.theme.appearance.nsAppearance
        splitController.applySidebarSide(config.sidebarSide)
        sidebarController.apply(theme: config.theme)
        contentController.apply(theme: config.theme)
        statusBar.apply(theme: config.theme)
        backgroundTintView.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.10).cgColor
    }

    private func refreshVisibleContent(animated: Bool = false) {
        onModeChange?(currentMode)

        switch currentMode {
        case .gallery:
            statusBar.setContext((paths.assetsURL.path as NSString).abbreviatingWithTildeInPath)
            statusBar.setStatusText("\(assets.count) assets")
            contentController.showGallery(assets: assets, emptyAction: { [weak self] in
                self?.revealAssetsFolder()
            }, animated: animated)
            onTitleChange?("Karabiner", nil)

        case .vault:
            guard let selectedNode = sidebarController.selectedNode else {
                let hasCollections = !nodes.isEmpty
                contentController.showVaultEmpty(
                    hasCollections: hasCollections,
                    newNoteAction: { [weak self] in self?.performNewNote() },
                    newCollectionAction: { [weak self] in self?.performNewCollection() },
                    revealVaultAction: { [weak self] in self?.revealVaultFolder() },
                    animated: animated
                )
                statusBar.setContext((paths.vaultURL.path as NSString).abbreviatingWithTildeInPath)
                statusBar.setStatusText("No note selected")
                onTitleChange?("Karabiner", nil)
                return
            }

            switch selectedNode.kind {
            case .document:
                openDocument(at: selectedNode.url, animated: animated)

            case .collection:
                selectedDocumentURL = nil
                SessionStore.saveSelectedDocumentURL(nil)
                documentSession.close()
                contentController.showCollection(
                    selectedNode,
                    newNoteAction: { [weak self] in self?.performNewNote(parent: selectedNode) },
                    newCollectionAction: { [weak self] in self?.performNewCollection(parent: selectedNode) },
                    revealAction: { [weak self] in
                        NSWorkspace.shared.activateFileViewerSelecting([selectedNode.url])
                    },
                    animated: animated
                )
                statusBar.setContext((selectedNode.url.path as NSString).abbreviatingWithTildeInPath)
                statusBar.setStatusText("Collection selected")
                onTitleChange?(selectedNode.displayName, selectedNode.url)
            }
        }
    }

    private func openDocument(at url: URL, animated: Bool) {
        if documentSession.currentURL?.standardizedFileURL == url.standardizedFileURL {
            contentController.showDocument(text: documentSession.text, at: url, animated: false)
            contentController.applyDocumentSnapshot(documentSession.currentSnapshot())
            statusBar.setContext((url.path as NSString).abbreviatingWithTildeInPath)
            onTitleChange?(url.deletingPathExtension().lastPathComponent, url)
            return
        }

        selectedDocumentURL = url
        SessionStore.saveSelectedDocumentURL(url)

        do {
            try documentSession.open(url)
            contentController.showDocument(text: documentSession.text, at: url, animated: animated)
            contentController.applyDocumentSnapshot(documentSession.currentSnapshot())
            statusBar.setContext((url.path as NSString).abbreviatingWithTildeInPath)
            onTitleChange?(url.deletingPathExtension().lastPathComponent, url)
        } catch {
            present(error: error, message: "Unable to open note")
            statusBar.setContext((url.path as NSString).abbreviatingWithTildeInPath)
            statusBar.setStatusText("Open failed")
        }
    }

    private func handleSidebarSelection(_ node: VaultNode?) {
        guard let node else {
            refreshVisibleContent(animated: true)
            return
        }

        if case .document = node.kind {
            currentMode = .vault
            onModeChange?(currentMode)
        }

        refreshVisibleContent(animated: true)
    }

    private func resolvedSelection(from preferredURL: URL?) -> VaultNode? {
        if let preferredURL, let preferredNode = findNode(for: preferredURL, in: nodes) {
            return preferredNode
        }
        if let savedURL = SessionStore.loadSelectedDocumentURL(), let savedNode = findNode(for: savedURL, in: nodes) {
            return savedNode
        }
        return vaultIndex.firstDocument(in: nodes) ?? nodes.first
    }

    private func findNode(for url: URL, in nodes: [VaultNode]) -> VaultNode? {
        for currentNode in nodes {
            if currentNode.url.standardizedFileURL == url.standardizedFileURL {
                return currentNode
            }
            if let nested = findNode(for: url, in: currentNode.children) {
                return nested
            }
        }
        return nil
    }

    private func parentFolder(for node: VaultNode?) -> URL {
        guard let node else {
            return paths.vaultURL
        }

        switch node.kind {
        case .collection:
            return node.url
        case .document:
            return node.url.deletingLastPathComponent()
        }
    }

    private func customizeCollection(_ node: VaultNode) {
        guard case let .collection(style) = node.kind else {
            return
        }

        guard let draft = presentCollectionSheet(existing: CollectionDraft(name: node.displayName, style: style ?? CollectionStyle())) else {
            return
        }

        do {
            if draft.name != node.displayName {
                let destination = FileSystemWriter.uniqueDirectory(in: node.url.deletingLastPathComponent(), baseName: draft.name)
                try FileManager.default.moveItem(at: node.url, to: destination)
                try FileSystemWriter.writeCollectionStyle(draft.style, to: destination)
                reloadWorkspace(WorkspaceChangeSet(vaultTreeChanged: true), preserveSelection: false)
                sidebarController.select(url: destination)
            } else {
                try FileSystemWriter.writeCollectionStyle(draft.style, to: node.url)
                reloadWorkspace(WorkspaceChangeSet(vaultTreeChanged: true), preserveSelection: true)
                sidebarController.select(url: node.url)
            }
        } catch {
            present(error: error, message: "Unable to update collection")
        }
    }

    private func revealAssetsFolder() {
        NSWorkspace.shared.activateFileViewerSelecting([paths.assetsURL])
    }

    private func revealVaultFolder() {
        NSWorkspace.shared.activateFileViewerSelecting([paths.vaultURL])
    }

    private func presentNoteSheet() -> String? {
        presentSheet(NoteSheetController(initialName: "Untitled"))
    }

    private func presentCollectionSheet(existing: CollectionDraft?) -> CollectionDraft? {
        presentSheet(CollectionSheetController(existing: existing))
    }

    private func presentSheet<Result>(_ controller: SheetHostingController<Result>) -> Result? {
        guard let window = view.window else {
            return nil
        }

        let sheetWindow = NSWindow(contentViewController: controller)
        sheetWindow.styleMask = NSWindow.StyleMask([.titled, .closable])
        sheetWindow.titleVisibility = NSWindow.TitleVisibility.hidden
        sheetWindow.titlebarAppearsTransparent = true
        sheetWindow.isReleasedWhenClosed = false

        window.beginSheet(sheetWindow)
        NSApp.runModal(for: sheetWindow)
        sheetWindow.orderOut(self)
        return controller.result
    }

    private func present(error: Error, message: String) {
        let alert = NSAlert(error: error)
        alert.messageText = message
        alert.runModal()
    }
}

struct CollectionDraft {
    let name: String
    let style: CollectionStyle
}

final class MainSplitViewController: NSSplitViewController {
    private let sidebarItem = NSSplitViewItem(sidebarWithViewController: NSViewController())
    private let contentItem = NSSplitViewItem(viewController: NSViewController())
    private var currentSide: SidebarSide = .left

    func configure(sidebarController: SidebarViewController, contentController: ContentContainerViewController) {
        sidebarItem.viewController = sidebarController
        sidebarItem.minimumThickness = 220
        sidebarItem.maximumThickness = 420
        sidebarItem.canCollapse = true

        contentItem.viewController = contentController
        contentItem.minimumThickness = 480
        contentItem.canCollapse = false

        addSplitViewItem(sidebarItem)
        addSplitViewItem(contentItem)
        splitView.autosaveName = "KarabinerMainSplitView"
    }

    func applySidebarSide(_ side: SidebarSide) {
        guard side != currentSide else {
            return
        }

        currentSide = side
        removeSplitViewItem(sidebarItem)
        removeSplitViewItem(contentItem)

        if side == .left {
            addSplitViewItem(sidebarItem)
            addSplitViewItem(contentItem)
        } else {
            addSplitViewItem(contentItem)
            addSplitViewItem(sidebarItem)
        }
    }

    func toggleSidebar() {
        sidebarItem.animator().isCollapsed.toggle()
    }
}
