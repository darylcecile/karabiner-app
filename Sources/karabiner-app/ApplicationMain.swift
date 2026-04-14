import AppKit

@main
enum KarabinerApplication {
    static func main() {
        let appDelegate = AppDelegate()
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        app.delegate = appDelegate
        AppMenuBuilder.build(delegate: appDelegate)
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let coordinator = AppCoordinator()

    func applicationDidFinishLaunching(_ notification: Notification) {
        coordinator.start()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }

    @objc func newNote(_ sender: Any?) {
        coordinator.newNote()
    }

    @objc func newCollection(_ sender: Any?) {
        coordinator.newCollection()
    }

    @objc func showVault(_ sender: Any?) {
        coordinator.showVault()
    }

    @objc func showGallery(_ sender: Any?) {
        coordinator.showGallery()
    }

    @objc func toggleSidebar(_ sender: Any?) {
        coordinator.toggleSidebar()
    }

    @objc func revealVault(_ sender: Any?) {
        coordinator.revealVault()
    }

    @objc func revealAssets(_ sender: Any?) {
        coordinator.revealAssets()
    }
}

enum AppMenuBuilder {
    @MainActor
    static func build(delegate: AppDelegate) {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Karabiner", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Karabiner", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu

        let newNoteItem = NSMenuItem(title: "New Note", action: #selector(AppDelegate.newNote(_:)), keyEquivalent: "n")
        newNoteItem.target = delegate
        fileMenu.addItem(newNoteItem)

        let newCollectionItem = NSMenuItem(title: "New Collection", action: #selector(AppDelegate.newCollection(_:)), keyEquivalent: "N")
        newCollectionItem.keyEquivalentModifierMask = [.command, .shift]
        newCollectionItem.target = delegate
        fileMenu.addItem(newCollectionItem)

        fileMenu.addItem(.separator())

        let revealVaultItem = NSMenuItem(title: "Reveal Vault in Finder", action: #selector(AppDelegate.revealVault(_:)), keyEquivalent: "")
        revealVaultItem.target = delegate
        fileMenu.addItem(revealVaultItem)

        let revealAssetsItem = NSMenuItem(title: "Reveal Assets in Finder", action: #selector(AppDelegate.revealAssets(_:)), keyEquivalent: "")
        revealAssetsItem.target = delegate
        fileMenu.addItem(revealAssetsItem)

        fileMenu.addItem(.separator())
        let quickOpenItem = NSMenuItem(title: "Quick Open…", action: #selector(MainWindowController.showQuickOpen(_:)), keyEquivalent: "O")
        quickOpenItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(quickOpenItem)

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu

        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redoItem = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redoItem)
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let findMenuItem = NSMenuItem(title: "Find", action: nil, keyEquivalent: "")
        editMenu.addItem(findMenuItem)
        let findMenu = NSMenu(title: "Find")
        findMenuItem.submenu = findMenu
        findMenu.addItem(withTitle: "Quick Open…", action: #selector(MainWindowController.showQuickOpen(_:)), keyEquivalent: "O")

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu

        let toggleSidebarItem = NSMenuItem(title: "Toggle Sidebar", action: #selector(AppDelegate.toggleSidebar(_:)), keyEquivalent: "s")
        toggleSidebarItem.keyEquivalentModifierMask = [.command, .option]
        toggleSidebarItem.target = delegate
        viewMenu.addItem(toggleSidebarItem)

        viewMenu.addItem(.separator())

        let vaultItem = NSMenuItem(title: "Show Vault", action: #selector(AppDelegate.showVault(_:)), keyEquivalent: "1")
        vaultItem.keyEquivalentModifierMask = [.command]
        vaultItem.target = delegate
        viewMenu.addItem(vaultItem)

        let galleryItem = NSMenuItem(title: "Show Gallery", action: #selector(AppDelegate.showGallery(_:)), keyEquivalent: "2")
        galleryItem.keyEquivalentModifierMask = [.command]
        galleryItem.target = delegate
        viewMenu.addItem(galleryItem)

        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Quick Look", action: #selector(MainWindowController.toggleQuickLook(_:)), keyEquivalent: " ")
        viewMenu.addItem(withTitle: "Open Selected Asset", action: #selector(MainWindowController.openSelectedAsset(_:)), keyEquivalent: "\r")
        viewMenu.addItem(withTitle: "Reveal Selected Asset", action: #selector(MainWindowController.revealSelectedAsset(_:)), keyEquivalent: "r")
    }
}
