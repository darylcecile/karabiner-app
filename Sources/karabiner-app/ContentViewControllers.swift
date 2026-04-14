import AppKit
import QuickLookUI

@MainActor
final class ContentContainerViewController: NSViewController, EditorViewControllerDelegate, GalleryViewControllerDelegate, CollectionContentViewControllerDelegate {
    var onMetricsChange: ((TextMetrics) -> Void)?
    var onContextChange: ((String) -> Void)?
    var onDocumentReloadRequest: (() -> Void)?
    var onDocumentOverwriteRequest: (() -> Void)?
    var onDocumentTextChange: ((String) -> Void)?
    var onGallerySelectionChange: ((AssetItem?) -> Void)?

    private let editorController = EditorViewController()
    private let galleryController = GalleryViewController()
    private let collectionController = CollectionContentViewController()
    private var currentController: NSViewController?

    override func loadView() {
        view = NSView()
        view.wantsLayer = true
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        editorController.delegate = self
        editorController.onReloadFromDisk = { [weak self] in
            self?.onDocumentReloadRequest?()
        }
        editorController.onOverwriteDisk = { [weak self] in
            self?.onDocumentOverwriteRequest?()
        }
        editorController.onContextChange = { [weak self] context in
            self?.onContextChange?(context)
        }
        galleryController.delegate = self
        collectionController.delegate = self
    }

    func showDocument(text: String, at url: URL, animated: Bool) {
        editorController.display(text: text, at: url)
        swap(to: editorController, animated: animated)
    }

    func applyDocumentSnapshot(_ snapshot: DocumentSessionSnapshot) {
        editorController.apply(sessionSnapshot: snapshot)
    }

    func focusEditor() {
        editorController.focusEditor()
    }

    func showVaultEmpty(
        hasCollections: Bool,
        newNoteAction: @escaping () -> Void,
        newCollectionAction: @escaping () -> Void,
        revealVaultAction: @escaping () -> Void,
        animated: Bool
    ) {
        let controller = EmptyStateViewController(
            title: hasCollections ? "Select a note to start writing" : "Your vault is empty",
            subtitle: hasCollections ? "Choose a markdown file from the sidebar, or create a new note with Command-N." : "Create a collection or drop markdown files into ~/.karabiner/vault.",
            primaryTitle: hasCollections ? "New Note" : "New Collection",
            secondaryTitle: hasCollections ? "New Collection" : "Reveal Vault",
            primaryAction: hasCollections ? newNoteAction : newCollectionAction,
            secondaryAction: hasCollections ? newCollectionAction : revealVaultAction
        )
        onContextChange?("~/.karabiner/vault")
        swap(to: controller, animated: animated)
    }

    func showCollection(_ node: VaultNode, newNoteAction: @escaping () -> Void, newCollectionAction: @escaping () -> Void, revealAction: @escaping () -> Void, animated: Bool) {
        collectionController.onNewNote = newNoteAction
        collectionController.onNewCollection = newCollectionAction
        collectionController.onReveal = revealAction
        collectionController.display(collection: node)
        onContextChange?(node.displayName)
        swap(to: collectionController, animated: animated)
    }

    func showGallery(assets: [AssetItem], emptyAction: @escaping () -> Void, animated: Bool) {
        guard !assets.isEmpty else {
            let controller = EmptyStateViewController(
                title: "No assets yet",
                subtitle: "Drop images, PDFs, or other files into ~/.karabiner/assets to build a lightweight media gallery.",
                primaryTitle: "Reveal Assets Folder",
                secondaryTitle: nil,
                primaryAction: emptyAction,
                secondaryAction: nil
            )
            onContextChange?("0 assets")
            swap(to: controller, animated: animated)
            return
        }

        galleryController.update(assets: assets)
        swap(to: galleryController, animated: animated)
    }

    func selectAsset(at url: URL) {
        galleryController.selectAsset(at: url)
    }

    func openSelectedAsset() {
        galleryController.openSelectedAsset()
    }

    func revealSelectedAsset() {
        galleryController.revealSelectedAsset()
    }

    func toggleQuickLook() {
        galleryController.toggleQuickLook()
    }

    func apply(theme: ThemeConfig) {
        editorController.apply(theme: theme)
        galleryController.apply(theme: theme)
        view.layer?.backgroundColor = (NSColor(hex: theme.editorBackgroundHex) ?? .textBackgroundColor).cgColor
    }

    func editorViewController(_ controller: EditorViewController, didChangeText text: String) {
        onDocumentTextChange?(text)
    }

    func editorViewController(_ controller: EditorViewController, didUpdateMetrics metrics: TextMetrics) {
        onMetricsChange?(metrics)
    }

    func galleryViewController(_ controller: GalleryViewController, didSelectAsset asset: AssetItem?) {
        onGallerySelectionChange?(asset)
        onContextChange?(asset?.displayName ?? "Assets")
    }

    func collectionContentViewController(_ controller: CollectionContentViewController, didOpenNode node: VaultNode) {
        switch node.kind {
        case .document:
            onDocumentOpenRequest?(node.url)
        case .collection:
            onCollectionOpenRequest?(node.url)
        }
    }

    var onDocumentOpenRequest: ((URL) -> Void)?
    var onCollectionOpenRequest: ((URL) -> Void)?

    private func swap(to controller: NSViewController, animated: Bool) {
        guard currentController !== controller else {
            return
        }

        let previous = currentController
        if let previous {
            previous.view.removeFromSuperview()
            previous.removeFromParent()
        }

        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        if animated {
            controller.view.alphaValue = 0
        }
        view.addSubview(controller.view)

        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.14
                controller.view.animator().alphaValue = 1
            }
        }

        currentController = controller
    }
}
