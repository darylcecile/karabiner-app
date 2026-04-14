import AppKit
import Foundation

enum AppRoute: Equatable {
    case note(URL)
    case collection(URL)
    case asset(URL)
}

enum QuickOpenKind: String {
    case note
    case collection
    case asset

    var symbolName: String {
        switch self {
        case .note:
            return "doc.text"
        case .collection:
            return "folder.fill"
        case .asset:
            return "photo.on.rectangle"
        }
    }
}

struct QuickOpenItem: Equatable {
    let route: AppRoute
    let title: String
    let subtitle: String
    let kind: QuickOpenKind
}

struct QuickOpenSnapshot: Equatable {
    let items: [QuickOpenItem]
}

enum QuickOpenIndexer {
    static func makeSnapshot(nodes: [VaultNode], assets: [AssetItem], paths: AppPaths) -> QuickOpenSnapshot {
        var items = flatten(nodes: nodes, rootURL: paths.vaultURL)
        items.append(contentsOf: assets.map { asset in
            QuickOpenItem(
                route: .asset(asset.url),
                title: asset.displayName,
                subtitle: relativePath(for: asset.url, rootURL: paths.assetsURL),
                kind: .asset
            )
        })
        return QuickOpenSnapshot(items: items)
    }

    private static func flatten(nodes: [VaultNode], rootURL: URL) -> [QuickOpenItem] {
        nodes.flatMap { node in
            var items: [QuickOpenItem] = []
            let subtitle = relativePath(for: node.url, rootURL: rootURL)

            switch node.kind {
            case .document:
                items.append(QuickOpenItem(route: .note(node.url), title: node.displayName, subtitle: subtitle, kind: .note))
            case .collection:
                items.append(QuickOpenItem(route: .collection(node.url), title: node.displayName, subtitle: subtitle, kind: .collection))
            }

            items.append(contentsOf: flatten(nodes: node.children, rootURL: rootURL))
            return items
        }
    }

    private static func relativePath(for url: URL, rootURL: URL) -> String {
        let rootPath = rootURL.standardizedFileURL.path + "/"
        let absolutePath = url.standardizedFileURL.path
        return absolutePath.hasPrefix(rootPath) ? String(absolutePath.dropFirst(rootPath.count)) : absolutePath
    }
}

enum QuickOpenMatcher {
    static func match(query: String, items: [QuickOpenItem]) -> [QuickOpenItem] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return items.sorted(by: defaultSort)
        }

        let normalizedQuery = trimmedQuery.lowercased()
        let scoredItems: [(QuickOpenItem, Int)] = items.compactMap { item in
            guard let score = score(for: normalizedQuery, item: item) else {
                return nil
            }
            return (item, score)
        }

        return scoredItems
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 {
                    return lhs.1 < rhs.1
                }
                return defaultSort(lhs.0, rhs.0)
            }
            .map { $0.0 }
    }

    private static func score(for query: String, item: QuickOpenItem) -> Int? {
        let title = item.title.lowercased()
        let subtitle = item.subtitle.lowercased()

        if title == query {
            return 0
        }
        if title.hasPrefix(query) {
            return 1
        }
        if let range = title.range(of: query) {
            return 2 + title.distance(from: title.startIndex, to: range.lowerBound)
        }
        if subtitle.contains(query) {
            return 100
        }

        return nil
    }

    private static func defaultSort(_ lhs: QuickOpenItem, _ rhs: QuickOpenItem) -> Bool {
        if lhs.kind != rhs.kind {
            return lhs.kind.rawValue < rhs.kind.rawValue
        }

        return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
    }
}

@MainActor
final class QuickOpenPanelController: NSWindowController, NSSearchFieldDelegate, NSTableViewDataSource, NSTableViewDelegate {
    var onOpenRoute: ((AppRoute) -> Void)?

    private let searchField = NSSearchField()
    private let scrollView = NSScrollView()
    private let tableView = NSTableView()
    private let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("quickOpen"))
    private var snapshot = QuickOpenSnapshot(items: [])
    private var results: [QuickOpenItem] = []

    init() {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 420),
            styleMask: [.titled, .utilityWindow, .closable],
            backing: .buffered,
            defer: false
        )
        panel.title = "Quick Open"
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.level = .floating
        super.init(window: panel)
        configureWindow(panel)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func show(relativeTo parentWindow: NSWindow?, snapshot: QuickOpenSnapshot, query: String?) {
        self.snapshot = snapshot
        searchField.stringValue = query ?? ""
        updateResults()
        positionIfNeeded(relativeTo: parentWindow)
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        window?.makeFirstResponder(searchField)
    }

    func update(snapshot: QuickOpenSnapshot) {
        self.snapshot = snapshot
        updateResults()
    }

    func controlTextDidChange(_ obj: Notification) {
        updateResults()
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.moveDown(_:)):
            moveSelection(by: 1)
            return true
        case #selector(NSResponder.moveUp(_:)):
            moveSelection(by: -1)
            return true
        case #selector(NSResponder.insertNewline(_:)):
            openSelectedItem()
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            closePanel()
            return true
        default:
            return false
        }
    }

    func numberOfRows(in tableView: NSTableView) -> Int {
        results.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let identifier = NSUserInterfaceItemIdentifier("QuickOpenCell")
        let item = results[row]
        let cell = (tableView.makeView(withIdentifier: identifier, owner: self) as? QuickOpenCellView) ?? QuickOpenCellView(frame: .zero)
        cell.identifier = identifier
        cell.configure(with: item)
        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard tableView.clickedRow >= 0, NSEvent.pressedMouseButtons != 0 else {
            return
        }
    }

    @objc private func handleDoubleAction(_ sender: Any?) {
        openSelectedItem()
    }

    private func configureWindow(_ panel: NSPanel) {
        let contentView = NSView()
        contentView.translatesAutoresizingMaskIntoConstraints = false

        searchField.placeholderString = "Jump to note or asset"
        searchField.translatesAutoresizingMaskIntoConstraints = false
        searchField.delegate = self

        tableView.headerView = nil
        tableView.rowHeight = 44
        tableView.addTableColumn(column)
        tableView.delegate = self
        tableView.dataSource = self
        tableView.doubleAction = #selector(handleDoubleAction(_:))
        tableView.target = self

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.documentView = tableView

        contentView.addSubview(searchField)
        contentView.addSubview(scrollView)

        NSLayoutConstraint.activate([
            searchField.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            searchField.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            searchField.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),

            scrollView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 14),
            scrollView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
        ])

        panel.contentView = contentView
    }

    private func updateResults() {
        results = QuickOpenMatcher.match(query: searchField.stringValue, items: snapshot.items)
        tableView.reloadData()
        if !results.isEmpty {
            tableView.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
        }
    }

    private func openSelectedItem() {
        guard tableView.selectedRow >= 0, results.indices.contains(tableView.selectedRow) else {
            return
        }

        let item = results[tableView.selectedRow]
        onOpenRoute?(item.route)
        closePanel()
    }

    private func closePanel() {
        window?.orderOut(nil)
    }

    private func moveSelection(by delta: Int) {
        guard !results.isEmpty else {
            return
        }

        let currentRow = max(tableView.selectedRow, 0)
        let nextRow = min(max(currentRow + delta, 0), results.count - 1)
        tableView.selectRowIndexes(IndexSet(integer: nextRow), byExtendingSelection: false)
        tableView.scrollRowToVisible(nextRow)
    }

    private func positionIfNeeded(relativeTo parentWindow: NSWindow?) {
        guard let window, let parentWindow, !window.isVisible else {
            return
        }

        let parentFrame = parentWindow.frame
        let width = window.frame.width
        let height = window.frame.height
        let origin = NSPoint(
            x: parentFrame.midX - (width / 2),
            y: parentFrame.midY - (height / 2)
        )
        window.setFrameOrigin(origin)
    }
}

final class QuickOpenCellView: NSTableCellView {
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let subtitleLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configureView()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with item: QuickOpenItem) {
        iconView.image = NSImage(systemSymbolName: item.kind.symbolName, accessibilityDescription: item.title)
        titleLabel.stringValue = item.title
        subtitleLabel.stringValue = item.subtitle
    }

    private func configureView() {
        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 15, weight: .medium)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 13, weight: .semibold)

        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.font = .systemFont(ofSize: 11)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.lineBreakMode = .byTruncatingMiddle

        let textStack = NSStackView(views: [titleLabel, subtitleLabel])
        textStack.orientation = .vertical
        textStack.alignment = .leading
        textStack.spacing = 2
        textStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(iconView)
        addSubview(textStack)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 18),
            iconView.heightAnchor.constraint(equalToConstant: 18),

            textStack.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 12),
            textStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            textStack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }
}
