import AppKit
import QuickLookUI

@MainActor
protocol GalleryViewControllerDelegate: AnyObject {
    func galleryViewController(_ controller: GalleryViewController, didSelectAsset asset: AssetItem?)
}

@MainActor
final class GalleryViewController: NSViewController, NSCollectionViewDataSource, NSCollectionViewDelegate {
    weak var delegate: GalleryViewControllerDelegate?

    private let backgroundView = NSView()
    private let scrollView = NSScrollView()
    private let collectionView = NSCollectionView()
    private let quickLookDataSource = GalleryQuickLookDataSource()
    private var assets: [AssetItem] = []

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureViews()
    }

    func update(assets: [AssetItem]) {
        self.assets = assets
        collectionView.reloadData()
    }

    func apply(theme: ThemeConfig) {
        backgroundView.layer?.backgroundColor = (NSColor(hex: theme.editorBackgroundHex) ?? .textBackgroundColor).cgColor
    }

    func selectAsset(at url: URL) {
        guard let index = assets.firstIndex(where: { $0.url.standardizedFileURL == url.standardizedFileURL }) else {
            return
        }

        let indexPath = IndexPath(item: index, section: 0)
        collectionView.selectItems(at: [indexPath], scrollPosition: .centeredVertically)
        delegate?.galleryViewController(self, didSelectAsset: assets[index])
    }

    func openSelectedAsset() {
        guard let asset = selectedAssets.first else {
            return
        }
        NSWorkspace.shared.open(asset.url)
    }

    func revealSelectedAsset() {
        guard !selectedAssets.isEmpty else {
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting(selectedAssets.map(\ .url))
    }

    func toggleQuickLook() {
        guard !selectedAssets.isEmpty else {
            return
        }

        let panel = QLPreviewPanel.shared()
        quickLookDataSource.items = selectedAssets.map(\ .url)
        panel?.dataSource = quickLookDataSource
        panel?.reloadData()
        panel?.currentPreviewItemIndex = 0
        panel?.makeKeyAndOrderFront(nil)
    }

    func collectionView(_ collectionView: NSCollectionView, numberOfItemsInSection section: Int) -> Int {
        assets.count
    }

    func collectionView(_ collectionView: NSCollectionView, itemForRepresentedObjectAt indexPath: IndexPath) -> NSCollectionViewItem {
        let identifier = NSUserInterfaceItemIdentifier("AssetItem")
        let item = (collectionView.makeItem(withIdentifier: identifier, for: indexPath) as? AssetCollectionViewItem) ?? AssetCollectionViewItem()
        item.identifier = identifier
        item.configure(with: assets[indexPath.item])
        return item
    }

    func collectionView(_ collectionView: NSCollectionView, didSelectItemsAt indexPaths: Set<IndexPath>) {
        delegate?.galleryViewController(self, didSelectAsset: selectedAssets.first)
    }

    @objc private func handleOpen(_ sender: Any?) {
        openSelectedAsset()
    }

    @objc private func handleQuickLook(_ sender: Any?) {
        toggleQuickLook()
    }

    @objc private func handleReveal(_ sender: Any?) {
        revealSelectedAsset()
    }

    private var selectedAssets: [AssetItem] {
        collectionView.selectionIndexPaths
            .map(\ .item)
            .sorted()
            .compactMap { assets.indices.contains($0) ? assets[$0] : nil }
    }

    private func configureViews() {
        backgroundView.translatesAutoresizingMaskIntoConstraints = false
        backgroundView.wantsLayer = true

        let layout = NSCollectionViewFlowLayout()
        layout.itemSize = NSSize(width: 172, height: 170)
        layout.sectionInset = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        layout.minimumInteritemSpacing = 16
        layout.minimumLineSpacing = 16

        collectionView.collectionViewLayout = layout
        collectionView.delegate = self
        collectionView.dataSource = self
        collectionView.isSelectable = true
        collectionView.backgroundColors = [.clear]
        collectionView.register(AssetCollectionViewItem.self, forItemWithIdentifier: NSUserInterfaceItemIdentifier("AssetItem"))
        collectionView.menu = galleryMenu()

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.documentView = collectionView

        view.addSubview(backgroundView)
        backgroundView.addSubview(scrollView)

        NSLayoutConstraint.activate([
            backgroundView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backgroundView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backgroundView.topAnchor.constraint(equalTo: view.topAnchor),
            backgroundView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            scrollView.leadingAnchor.constraint(equalTo: backgroundView.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: backgroundView.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: backgroundView.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: backgroundView.bottomAnchor),
        ])

        apply(theme: .default)
    }

    private func galleryMenu() -> NSMenu {
        let menu = NSMenu()
        let openItem = NSMenuItem(title: "Open", action: #selector(handleOpen(_:)), keyEquivalent: "")
        openItem.target = self
        menu.addItem(openItem)

        let quickLookItem = NSMenuItem(title: "Quick Look", action: #selector(handleQuickLook(_:)), keyEquivalent: "")
        quickLookItem.target = self
        menu.addItem(quickLookItem)

        let revealItem = NSMenuItem(title: "Reveal in Finder", action: #selector(handleReveal(_:)), keyEquivalent: "")
        revealItem.target = self
        menu.addItem(revealItem)
        return menu
    }
}

final class GalleryQuickLookDataSource: NSObject, @preconcurrency QLPreviewPanelDataSource {
    var items: [URL] = []

    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        items.count
    }

    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> QLPreviewItem! {
        items[index] as NSURL
    }
}

final class AssetCollectionViewItem: NSCollectionViewItem {
    private let cardView = NSView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(labelWithString: "")
    private var representedURL: URL?

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureViews()
    }

    override var isSelected: Bool {
        didSet {
            updateSelectionAppearance()
        }
    }

    func configure(with asset: AssetItem) {
        representedURL = asset.url
        titleLabel.stringValue = asset.displayName
        detailLabel.stringValue = asset.type?.localizedDescription ?? "File"
        imageView?.image = NSWorkspace.shared.icon(forFile: asset.url.path)

        AssetThumbnailService.shared.thumbnail(for: asset, size: CGSize(width: 132, height: 100)) { [weak self] image in
            guard let self, self.representedURL?.standardizedFileURL == asset.url.standardizedFileURL else {
                return
            }
            self.imageView?.image = image
        }
    }

    private func configureViews() {
        let imageView = NSImageView()
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 42, weight: .regular)
        self.imageView = imageView

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingMiddle
        titleLabel.alignment = .center

        detailLabel.translatesAutoresizingMaskIntoConstraints = false
        detailLabel.font = .systemFont(ofSize: 10, weight: .medium)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.alignment = .center

        cardView.translatesAutoresizingMaskIntoConstraints = false
        cardView.wantsLayer = true
        cardView.layer?.cornerRadius = 14

        view.addSubview(cardView)
        cardView.addSubview(imageView)
        cardView.addSubview(titleLabel)
        cardView.addSubview(detailLabel)

        NSLayoutConstraint.activate([
            cardView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cardView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cardView.topAnchor.constraint(equalTo: view.topAnchor),
            cardView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            imageView.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            imageView.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),
            imageView.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 16),
            imageView.heightAnchor.constraint(equalToConstant: 102),

            titleLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
            titleLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),
            titleLabel.topAnchor.constraint(equalTo: imageView.bottomAnchor, constant: 10),

            detailLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
            detailLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
        ])

        updateSelectionAppearance()
    }

    private func updateSelectionAppearance() {
        let strokeColor = isSelected ? NSColor.controlAccentColor : NSColor.separatorColor.withAlphaComponent(0.35)
        let fillColor = isSelected ? NSColor.controlAccentColor.withAlphaComponent(0.14) : NSColor.controlBackgroundColor.withAlphaComponent(0.45)
        cardView.layer?.borderWidth = 1
        cardView.layer?.borderColor = strokeColor.cgColor
        cardView.layer?.backgroundColor = fillColor.cgColor
    }
}
