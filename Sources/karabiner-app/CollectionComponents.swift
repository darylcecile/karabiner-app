import AppKit

@MainActor
protocol CollectionContentViewControllerDelegate: AnyObject {
    func collectionContentViewController(_ controller: CollectionContentViewController, didOpenNode node: VaultNode)
}

@MainActor
final class CollectionContentViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    weak var delegate: CollectionContentViewControllerDelegate?

    private let headerIcon = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let summaryLabel = NSTextField(labelWithString: "")
    private let emptyLabel = NSTextField(labelWithString: "")
    private let scrollView = NSScrollView()
    private let tableView = NSTableView()
    private let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("collectionItems"))
    private let newNoteButton = NSButton(title: "New Note", target: nil, action: nil)
    private let newCollectionButton = NSButton(title: "New Collection", target: nil, action: nil)
    private let revealButton = NSButton(title: "Reveal in Finder", target: nil, action: nil)
    private var currentNode: VaultNode?
    private var childNodes: [VaultNode] = []

    var onNewNote: (() -> Void)?
    var onNewCollection: (() -> Void)?
    var onReveal: (() -> Void)?

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureViews()
    }

    func display(collection node: VaultNode) {
        currentNode = node
        childNodes = node.children

        let image = NSImage(systemSymbolName: node.symbolName, accessibilityDescription: node.displayName)
        image?.isTemplate = node.tintColor == nil
        headerIcon.image = image
        headerIcon.contentTintColor = node.tintColor ?? .secondaryLabelColor
        titleLabel.stringValue = node.displayName

        let noteCount = childNodes.filter {
            if case .document = $0.kind { return true }
            return false
        }.count
        let collectionCount = childNodes.filter(\ .isCollection).count
        let countSummary = "\(noteCount) notes, \(collectionCount) collections"
        let path = (node.url.path as NSString).abbreviatingWithTildeInPath
        summaryLabel.stringValue = "\(countSummary)   \(path)"
        emptyLabel.stringValue = "No items in this collection. Create a note or a nested collection here."
        emptyLabel.isHidden = !childNodes.isEmpty
        scrollView.isHidden = childNodes.isEmpty
        tableView.reloadData()
    }

    func numberOfRows(in tableView: NSTableView) -> Int {
        childNodes.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let identifier = NSUserInterfaceItemIdentifier("CollectionRow")
        let cell = (tableView.makeView(withIdentifier: identifier, owner: self) as? CollectionRowView) ?? CollectionRowView(frame: .zero)
        cell.identifier = identifier
        cell.configure(with: childNodes[row])
        return cell
    }

    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        true
    }

    @objc private func handleOpenSelectedRow(_ sender: Any?) {
        guard tableView.selectedRow >= 0, childNodes.indices.contains(tableView.selectedRow) else {
            return
        }
        delegate?.collectionContentViewController(self, didOpenNode: childNodes[tableView.selectedRow])
    }

    @objc private func handleNewNote(_ sender: Any?) {
        onNewNote?()
    }

    @objc private func handleNewCollection(_ sender: Any?) {
        onNewCollection?()
    }

    @objc private func handleReveal(_ sender: Any?) {
        onReveal?()
    }

    private func configureViews() {
        headerIcon.translatesAutoresizingMaskIntoConstraints = false
        headerIcon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 26, weight: .medium)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 22, weight: .semibold)

        summaryLabel.translatesAutoresizingMaskIntoConstraints = false
        summaryLabel.font = .systemFont(ofSize: 12)
        summaryLabel.textColor = .secondaryLabelColor
        summaryLabel.lineBreakMode = .byTruncatingMiddle

        let textStack = NSStackView(views: [titleLabel, summaryLabel])
        textStack.orientation = .vertical
        textStack.alignment = .leading
        textStack.spacing = 4
        textStack.translatesAutoresizingMaskIntoConstraints = false

        newNoteButton.target = self
        newNoteButton.action = #selector(handleNewNote(_:))
        newCollectionButton.target = self
        newCollectionButton.action = #selector(handleNewCollection(_:))
        revealButton.target = self
        revealButton.action = #selector(handleReveal(_:))

        let buttonStack = NSStackView(views: [revealButton, newCollectionButton, newNoteButton])
        buttonStack.orientation = .horizontal
        buttonStack.spacing = 10
        buttonStack.translatesAutoresizingMaskIntoConstraints = false

        emptyLabel.translatesAutoresizingMaskIntoConstraints = false
        emptyLabel.font = .systemFont(ofSize: 13)
        emptyLabel.textColor = .secondaryLabelColor

        tableView.headerView = nil
        tableView.addTableColumn(column)
        tableView.delegate = self
        tableView.dataSource = self
        tableView.rowHeight = 40
        tableView.doubleAction = #selector(handleOpenSelectedRow(_:))
        tableView.target = self
        tableView.focusRingType = .none

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.documentView = tableView

        view.addSubview(headerIcon)
        view.addSubview(textStack)
        view.addSubview(buttonStack)
        view.addSubview(emptyLabel)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            headerIcon.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            headerIcon.topAnchor.constraint(equalTo: view.topAnchor, constant: 24),
            headerIcon.widthAnchor.constraint(equalToConstant: 30),
            headerIcon.heightAnchor.constraint(equalToConstant: 30),

            textStack.leadingAnchor.constraint(equalTo: headerIcon.trailingAnchor, constant: 14),
            textStack.centerYAnchor.constraint(equalTo: headerIcon.centerYAnchor),
            textStack.trailingAnchor.constraint(lessThanOrEqualTo: buttonStack.leadingAnchor, constant: -20),

            buttonStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            buttonStack.centerYAnchor.constraint(equalTo: headerIcon.centerYAnchor),

            emptyLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            emptyLabel.topAnchor.constraint(equalTo: headerIcon.bottomAnchor, constant: 28),
            emptyLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),

            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: headerIcon.bottomAnchor, constant: 20),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }
}

final class CollectionRowView: NSTableCellView {
    private let iconView = NSImageView()
    private let titleField = NSTextField(labelWithString: "")
    private let subtitleField = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configureView()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with node: VaultNode) {
        let image = NSImage(systemSymbolName: node.symbolName, accessibilityDescription: node.displayName)
        image?.isTemplate = node.tintColor == nil
        iconView.image = image
        iconView.contentTintColor = node.tintColor ?? .secondaryLabelColor
        titleField.stringValue = node.displayName

        switch node.kind {
        case .document:
            subtitleField.stringValue = "Markdown note"
        case .collection:
            subtitleField.stringValue = node.children.isEmpty ? "Empty collection" : "\(node.children.count) items"
        }
    }

    private func configureView() {
        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)

        titleField.translatesAutoresizingMaskIntoConstraints = false
        titleField.font = .systemFont(ofSize: 13, weight: .semibold)

        subtitleField.translatesAutoresizingMaskIntoConstraints = false
        subtitleField.font = .systemFont(ofSize: 11)
        subtitleField.textColor = .secondaryLabelColor

        let textStack = NSStackView(views: [titleField, subtitleField])
        textStack.orientation = .vertical
        textStack.alignment = .leading
        textStack.spacing = 2
        textStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(iconView)
        addSubview(textStack)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 18),
            iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 16),

            textStack.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 12),
            textStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            textStack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }
}
