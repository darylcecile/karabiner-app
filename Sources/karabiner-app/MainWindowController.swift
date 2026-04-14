import AppKit

@MainActor
final class MainWindowController: NSWindowController, NSToolbarDelegate, NSWindowDelegate {
    private enum ToolbarIdentifier {
        static let toggleSidebar = NSToolbarItem.Identifier("toggleSidebar")
        static let modeSwitcher = NSToolbarItem.Identifier("modeSwitcher")
        static let search = NSToolbarItem.Identifier("search")
        static let newCollection = NSToolbarItem.Identifier("newCollection")
        static let newNote = NSToolbarItem.Identifier("newNote")
    }

    private let rootController: MainViewController
    private let modeControl = NSSegmentedControl(labels: ["Vault", "Gallery"], trackingMode: .selectOne, target: nil, action: nil)
    private let searchItem = NSSearchToolbarItem(itemIdentifier: ToolbarIdentifier.search)
    private let quickOpenPanel = QuickOpenPanelController()

    init(paths: AppPaths, configStore: ConfigStore, vaultIndex: VaultIndex, assetIndex: AssetIndex) {
        rootController = MainViewController(paths: paths, configStore: configStore, vaultIndex: vaultIndex, assetIndex: assetIndex)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        window.contentViewController = rootController
        window.title = "Karabiner"
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = false
        window.toolbarStyle = .unified
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 920, height: 600)
        window.setFrameAutosaveName("KarabinerMainWindow")
        window.backgroundColor = .windowBackgroundColor

        super.init(window: window)

        shouldCascadeWindows = false
        configureToolbar()
        bindRootCallbacks()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func windowDidLoad() {
        super.windowDidLoad()
        window?.delegate = self
        rootController.start()
    }

    func windowWillClose(_ notification: Notification) {
        rootController.stop()
    }

    func performNewNote() {
        rootController.performNewNote()
    }

    func performNewCollection() {
        rootController.performNewCollection()
    }

    func showVault() {
        rootController.setContentMode(.vault)
    }

    func showGallery() {
        rootController.setContentMode(.gallery)
    }

    func toggleSidebar() {
        rootController.toggleSidebar()
    }

    @objc private func handleModeChange(_ sender: NSSegmentedControl) {
        rootController.setContentMode(sender.selectedSegment == 1 ? .gallery : .vault)
    }

    @objc private func handleNewNote(_ sender: Any?) {
        performNewNote()
    }

    @objc private func handleNewCollection(_ sender: Any?) {
        performNewCollection()
    }

    @objc private func handleToggleSidebar(_ sender: Any?) {
        toggleSidebar()
    }

    private func configureToolbar() {
        let toolbar = NSToolbar(identifier: "KarabinerToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        toolbar.showsBaselineSeparator = true
        window?.toolbar = toolbar

        modeControl.segmentStyle = .rounded
        modeControl.selectedSegment = 0
        modeControl.target = self
        modeControl.action = #selector(handleModeChange(_:))

        searchItem.searchField.placeholderString = "Quick Open"
        searchItem.searchField.target = self
        searchItem.searchField.action = #selector(handleSearchField(_:))
    }

    private func bindRootCallbacks() {
        rootController.onModeChange = { [weak self] mode in
            self?.modeControl.selectedSegment = mode == .vault ? 0 : 1
        }

        rootController.onTitleChange = { [weak self] title, representedURL in
            self?.window?.title = title
            self?.window?.representedURL = representedURL
        }

        rootController.onQuickOpenSnapshotChange = { [weak self] snapshot in
            self?.quickOpenPanel.update(snapshot: snapshot)
        }

        quickOpenPanel.onOpenRoute = { [weak self] route in
            self?.rootController.open(route: route)
        }
    }

    @objc func showQuickOpen(_ sender: Any?) {
        quickOpenPanel.show(relativeTo: window, snapshot: rootController.currentQuickOpenSnapshot(), query: searchItem.searchField.stringValue)
    }

    @objc func openSelectedAsset(_ sender: Any?) {
        rootController.openSelectedAsset()
    }

    @objc func revealSelectedAsset(_ sender: Any?) {
        rootController.revealSelectedAsset()
    }

    @objc func toggleQuickLook(_ sender: Any?) {
        rootController.toggleQuickLook()
    }

    @objc private func handleSearchField(_ sender: NSSearchField) {
        showQuickOpen(sender)
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ToolbarIdentifier.toggleSidebar, ToolbarIdentifier.modeSwitcher, ToolbarIdentifier.search, .flexibleSpace, ToolbarIdentifier.newCollection, ToolbarIdentifier.newNote]
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ToolbarIdentifier.toggleSidebar, ToolbarIdentifier.modeSwitcher, ToolbarIdentifier.search, .flexibleSpace, ToolbarIdentifier.newCollection, ToolbarIdentifier.newNote]
    }

    func toolbar(
        _ toolbar: NSToolbar,
        itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
        willBeInsertedIntoToolbar flag: Bool
    ) -> NSToolbarItem? {
        switch itemIdentifier {
        case ToolbarIdentifier.toggleSidebar:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Sidebar"
            item.toolTip = "Toggle Sidebar"
            item.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: item.label)
            item.target = self
            item.action = #selector(handleToggleSidebar(_:))
            return item

        case ToolbarIdentifier.modeSwitcher:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Mode"
            item.view = modeControl
            return item

        case ToolbarIdentifier.search:
            searchItem.label = "Quick Open"
            searchItem.paletteLabel = "Quick Open"
            return searchItem

        case ToolbarIdentifier.newCollection:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "New Collection"
            item.toolTip = "New Collection"
            item.image = NSImage(systemSymbolName: "folder.badge.plus", accessibilityDescription: item.label)
            item.target = self
            item.action = #selector(handleNewCollection(_:))
            return item

        case ToolbarIdentifier.newNote:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "New Note"
            item.toolTip = "New Note"
            item.image = NSImage(systemSymbolName: "square.and.pencil", accessibilityDescription: item.label)
            item.target = self
            item.action = #selector(handleNewNote(_:))
            return item

        default:
            return nil
        }
    }
}
