import AppKit

@MainActor
final class SidebarViewController: NSViewController, NSOutlineViewDataSource, NSOutlineViewDelegate, NSMenuDelegate {
    var onSelection: ((VaultNode?) -> Void)?
    var onNewCollection: ((VaultNode?) -> Void)?
    var onNewNote: ((VaultNode?) -> Void)?
    var onCustomizeCollection: ((VaultNode) -> Void)?
    var onReveal: ((VaultNode) -> Void)?

    private let backgroundEffectView = NSVisualEffectView()
    private let tintView = NSView()
    private let titleLabel = NSTextField(labelWithString: "Collections")
    private let pathLabel = NSTextField(labelWithString: "~/.karabiner/vault")
    private let scrollView = NSScrollView()
    private let outlineView = NSOutlineView()
    private let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("main"))
    private let contextMenu = NSMenu()
    private var nodes: [VaultNode] = []
    private var rootDisplayPath = ""
    private var expandedPaths = Set<String>()

    var selectedNode: VaultNode? {
        guard outlineView.selectedRow >= 0 else {
            return nil
        }
        return outlineView.item(atRow: outlineView.selectedRow) as? VaultNode
    }

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureViews()
    }

    func render(nodes: [VaultNode], selectedURL: URL?) {
        rememberExpandedState()
        self.nodes = nodes
        outlineView.reloadData()
        restoreExpandedState()

        if let selectedURL {
            select(url: selectedURL)
        } else if outlineView.numberOfRows > 0 {
            outlineView.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
        }
    }

    func setRootDisplayPath(_ path: String) {
        rootDisplayPath = path
        pathLabel.stringValue = path
    }

    func select(url: URL) {
        expandPath(to: url, in: nodes)

        guard let row = row(for: url) else {
            return
        }

        outlineView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        outlineView.scrollRowToVisible(row)
    }

    func apply(theme: ThemeConfig) {
        backgroundEffectView.material = theme.sidebarMaterial.nsMaterial
        backgroundEffectView.state = .followsWindowActiveState

        let tint = NSColor(hex: theme.sidebarTintHex) ?? .controlAccentColor
        tintView.layer?.backgroundColor = tint.withAlphaComponent(theme.sidebarTintAlpha).cgColor
    }

    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
        let nodes = (item as? VaultNode)?.children ?? self.nodes
        return nodes.count
    }

    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
        guard let node = item as? VaultNode else {
            return false
        }

        return node.isCollection && !node.children.isEmpty
    }

    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
        let nodes = (item as? VaultNode)?.children ?? self.nodes
        return nodes[index]
    }

    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        guard let node = item as? VaultNode else {
            return nil
        }

        let identifier = NSUserInterfaceItemIdentifier("SidebarCell")
        let cell = (outlineView.makeView(withIdentifier: identifier, owner: self) as? SidebarCellView) ?? SidebarCellView(frame: .zero)
        cell.identifier = identifier
        cell.configure(with: node)
        return cell
    }

    func outlineViewSelectionDidChange(_ notification: Notification) {
        onSelection?(selectedNode)
    }

    func outlineViewItemDidExpand(_ notification: Notification) {
        rememberExpandedState()
    }

    func outlineViewItemDidCollapse(_ notification: Notification) {
        rememberExpandedState()
    }

    func outlineView(_ outlineView: NSOutlineView, heightOfRowByItem item: Any) -> CGFloat {
        28
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let selectedNode = contextualNode

        let newCollectionItem = NSMenuItem(title: "New Collection", action: #selector(handleNewCollection(_:)), keyEquivalent: "")
        newCollectionItem.target = self
        menu.addItem(newCollectionItem)

        let newNoteItem = NSMenuItem(title: "New Note", action: #selector(handleNewNote(_:)), keyEquivalent: "")
        newNoteItem.target = self
        menu.addItem(newNoteItem)

        guard let selectedNode else {
            return
        }

        menu.addItem(.separator())

        if selectedNode.isCollection {
            let customizeItem = NSMenuItem(title: "Customize Collection", action: #selector(handleCustomizeCollection(_:)), keyEquivalent: "")
            customizeItem.target = self
            menu.addItem(customizeItem)
        }

        let revealItem = NSMenuItem(title: "Reveal in Finder", action: #selector(handleReveal(_:)), keyEquivalent: "")
        revealItem.target = self
        menu.addItem(revealItem)
    }

    @objc private func handleNewCollection(_ sender: Any?) {
        onNewCollection?(contextualNode)
    }

    @objc private func handleNewNote(_ sender: Any?) {
        onNewNote?(contextualNode)
    }

    @objc private func handleCustomizeCollection(_ sender: Any?) {
        guard let contextualNode, contextualNode.isCollection else {
            return
        }

        onCustomizeCollection?(contextualNode)
    }

    @objc private func handleReveal(_ sender: Any?) {
        guard let contextualNode else {
            return
        }

        onReveal?(contextualNode)
    }

    private var contextualNode: VaultNode? {
        let row = outlineView.clickedRow >= 0 ? outlineView.clickedRow : outlineView.selectedRow
        guard row >= 0 else {
            return nil
        }
        return outlineView.item(atRow: row) as? VaultNode
    }

    private func configureViews() {
        backgroundEffectView.material = .sidebar
        backgroundEffectView.blendingMode = .behindWindow
        backgroundEffectView.state = .followsWindowActiveState
        backgroundEffectView.translatesAutoresizingMaskIntoConstraints = false

        tintView.translatesAutoresizingMaskIntoConstraints = false
        tintView.wantsLayer = true

        titleLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        pathLabel.font = .systemFont(ofSize: 11, weight: .medium)
        pathLabel.textColor = .secondaryLabelColor
        pathLabel.stringValue = rootDisplayPath

        let headerStack = NSStackView(views: [titleLabel, pathLabel])
        headerStack.orientation = .vertical
        headerStack.alignment = .leading
        headerStack.spacing = 2
        headerStack.translatesAutoresizingMaskIntoConstraints = false

        outlineView.headerView = nil
        outlineView.addTableColumn(column)
        outlineView.outlineTableColumn = column
        outlineView.delegate = self
        outlineView.dataSource = self
        outlineView.style = .sourceList
        outlineView.focusRingType = .none
        outlineView.rowSizeStyle = .medium
        outlineView.intercellSpacing = NSSize(width: 0, height: 2)
        outlineView.menu = contextMenu

        contextMenu.delegate = self

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.documentView = outlineView

        view.addSubview(backgroundEffectView)
        view.addSubview(tintView)
        view.addSubview(headerStack)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            backgroundEffectView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backgroundEffectView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backgroundEffectView.topAnchor.constraint(equalTo: view.topAnchor),
            backgroundEffectView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            tintView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tintView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tintView.topAnchor.constraint(equalTo: view.topAnchor),
            tintView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            headerStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            headerStack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -18),
            headerStack.topAnchor.constraint(equalTo: view.topAnchor, constant: 18),

            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: headerStack.bottomAnchor, constant: 12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func row(for url: URL) -> Int? {
        for row in 0..<outlineView.numberOfRows {
            guard let node = outlineView.item(atRow: row) as? VaultNode else {
                continue
            }

            if node.url.standardizedFileURL == url.standardizedFileURL {
                return row
            }
        }

        return nil
    }

    @discardableResult
    private func expandPath(to url: URL, in nodes: [VaultNode]) -> Bool {
        for node in nodes {
            if node.url.standardizedFileURL == url.standardizedFileURL {
                return true
            }

            if expandPath(to: url, in: node.children) {
                outlineView.expandItem(node)
                expandedPaths.insert(node.url.path)
                return true
            }
        }

        return false
    }

    private func rememberExpandedState() {
        var paths = Set<String>()
        for row in 0..<outlineView.numberOfRows {
            guard let node = outlineView.item(atRow: row) as? VaultNode, outlineView.isItemExpanded(node) else {
                continue
            }

            paths.insert(node.url.path)
        }
        expandedPaths = paths
    }

    private func restoreExpandedState() {
        for node in nodes {
            restoreExpandedState(for: node)
        }
    }

    private func restoreExpandedState(for node: VaultNode) {
        guard node.isCollection else {
            return
        }

        if expandedPaths.contains(node.url.path) || node.url.deletingLastPathComponent() == node.url {
            outlineView.expandItem(node)
        }

        for child in node.children where child.isCollection {
            restoreExpandedState(for: child)
        }
    }
}

final class SidebarCellView: NSTableCellView {
    private let symbolView = NSImageView()
    private let titleField = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with node: VaultNode) {
        titleField.stringValue = node.displayName

        let image = NSImage(systemSymbolName: node.symbolName, accessibilityDescription: node.displayName)
        image?.isTemplate = node.tintColor == nil
        symbolView.image = image
        symbolView.contentTintColor = node.tintColor ?? .secondaryLabelColor
    }

    private func configure() {
        wantsLayer = true

        symbolView.translatesAutoresizingMaskIntoConstraints = false
        symbolView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 13, weight: .medium)

        titleField.translatesAutoresizingMaskIntoConstraints = false
        titleField.font = .systemFont(ofSize: 13, weight: .medium)
        titleField.lineBreakMode = .byTruncatingMiddle

        addSubview(symbolView)
        addSubview(titleField)

        NSLayoutConstraint.activate([
            symbolView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            symbolView.centerYAnchor.constraint(equalTo: centerYAnchor),
            symbolView.widthAnchor.constraint(equalToConstant: 16),
            symbolView.heightAnchor.constraint(equalToConstant: 16),

            titleField.leadingAnchor.constraint(equalTo: symbolView.trailingAnchor, constant: 8),
            titleField.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            titleField.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }
}
