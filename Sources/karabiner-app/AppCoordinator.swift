import AppKit
import Foundation

@MainActor
final class AppCoordinator {
    private let paths = AppPaths()
    private lazy var configStore = ConfigStore(paths: paths)
    private let vaultIndex = VaultIndex()
    private let assetIndex = AssetIndex()
    private var windowController: MainWindowController?

    func start() {
        do {
            try paths.ensureExists()
        } catch {
            presentFatalError(error)
            return
        }

        let windowController = MainWindowController(
            paths: paths,
            configStore: configStore,
            vaultIndex: vaultIndex,
            assetIndex: assetIndex
        )
        self.windowController = windowController
        windowController.showWindow(nil)
    }

    func newNote() {
        windowController?.performNewNote()
    }

    func newCollection() {
        windowController?.performNewCollection()
    }

    func showVault() {
        windowController?.showVault()
    }

    func showGallery() {
        windowController?.showGallery()
    }

    func toggleSidebar() {
        windowController?.toggleSidebar()
    }

    func revealVault() {
        NSWorkspace.shared.activateFileViewerSelecting([paths.vaultURL])
    }

    func revealAssets() {
        NSWorkspace.shared.activateFileViewerSelecting([paths.assetsURL])
    }

    private func presentFatalError(_ error: Error) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Karabiner couldn’t start"
        alert.informativeText = error.localizedDescription
        alert.runModal()
        NSApp.terminate(nil)
    }
}
