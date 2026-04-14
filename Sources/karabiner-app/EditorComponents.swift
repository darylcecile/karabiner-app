import AppKit

@MainActor
protocol EditorViewControllerDelegate: AnyObject {
    func editorViewController(_ controller: EditorViewController, didChangeText text: String)
    func editorViewController(_ controller: EditorViewController, didUpdateMetrics metrics: TextMetrics)
}

@MainActor
final class EditorViewController: NSViewController, NSTextViewDelegate {
    weak var delegate: EditorViewControllerDelegate?

    private let backgroundView = NSView()
    private let scrollView = NSScrollView()
    private let textView = NSTextView()
    private let statusPill = NSTextField(labelWithString: "")
    private let conflictBar = NSVisualEffectView()
    private let conflictLabel = NSTextField(labelWithString: "")
    private let reloadButton = NSButton(title: "Reload", target: nil, action: nil)
    private let overwriteButton = NSButton(title: "Overwrite", target: nil, action: nil)
    private var suppressChangeNotifications = false

    var onReloadFromDisk: (() -> Void)?
    var onOverwriteDisk: (() -> Void)?
    var onContextChange: ((String) -> Void)?

    override func loadView() {
        view = NSView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureViews()
    }

    func display(text: String, at url: URL) {
        suppressChangeNotifications = true
        textView.string = text
        suppressChangeNotifications = false
        onContextChange?((url.path as NSString).abbreviatingWithTildeInPath)
        updateMetrics()
    }

    func focusEditor() {
        view.window?.makeFirstResponder(textView)
    }

    func apply(theme: ThemeConfig) {
        backgroundView.layer?.backgroundColor = (NSColor(hex: theme.editorBackgroundHex) ?? .textBackgroundColor).cgColor
        textView.insertionPointColor = .controlAccentColor
    }

    func apply(sessionSnapshot: DocumentSessionSnapshot) {
        statusPill.stringValue = sessionSnapshot.saveState.statusText
        let shouldShowConflict = sessionSnapshot.saveState == .conflict || sessionSnapshot.saveState == .missing
        conflictBar.isHidden = !shouldShowConflict
        switch sessionSnapshot.saveState {
        case .conflict:
            conflictLabel.stringValue = "This note changed on disk while you were editing."
        case .missing:
            conflictLabel.stringValue = "This note is missing on disk. Overwrite to recreate it."
        default:
            conflictLabel.stringValue = ""
        }
    }

    func textDidChange(_ notification: Notification) {
        guard !suppressChangeNotifications else {
            return
        }

        delegate?.editorViewController(self, didChangeText: textView.string)
        updateMetrics()
    }

    func textViewDidChangeSelection(_ notification: Notification) {
        updateMetrics()
    }

    @objc private func handleReload(_ sender: Any?) {
        onReloadFromDisk?()
    }

    @objc private func handleOverwrite(_ sender: Any?) {
        onOverwriteDisk?()
    }

    private func configureViews() {
        backgroundView.translatesAutoresizingMaskIntoConstraints = false
        backgroundView.wantsLayer = true

        conflictBar.material = .headerView
        conflictBar.state = .followsWindowActiveState
        conflictBar.translatesAutoresizingMaskIntoConstraints = false
        conflictBar.isHidden = true

        conflictLabel.font = .systemFont(ofSize: 12, weight: .medium)
        conflictLabel.textColor = .secondaryLabelColor
        conflictLabel.translatesAutoresizingMaskIntoConstraints = false

        reloadButton.target = self
        reloadButton.action = #selector(handleReload(_:))
        reloadButton.bezelStyle = .rounded
        reloadButton.translatesAutoresizingMaskIntoConstraints = false

        overwriteButton.target = self
        overwriteButton.action = #selector(handleOverwrite(_:))
        overwriteButton.bezelStyle = .recessed
        overwriteButton.translatesAutoresizingMaskIntoConstraints = false

        statusPill.font = .systemFont(ofSize: 11, weight: .semibold)
        statusPill.textColor = .secondaryLabelColor
        statusPill.translatesAutoresizingMaskIntoConstraints = false

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.delegate = self
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.allowsUndo = true
        textView.isIncrementalSearchingEnabled = true
        textView.font = .systemFont(ofSize: 15)
        textView.textContainerInset = NSSize(width: 28, height: 28)
        textView.textContainer?.lineFragmentPadding = 0
        textView.textContainer?.containerSize = NSSize(width: 760, height: CoreFoundation.CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.widthTracksTextView = false
        textView.isHorizontallyResizable = false
        textView.maxSize = NSSize(width: 760, height: CoreFoundation.CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.heightTracksTextView = false
        textView.autoresizingMask = [.width]
        textView.drawsBackground = false
        textView.backgroundColor = .clear

        scrollView.documentView = textView

        backgroundView.addSubview(conflictBar)
        conflictBar.addSubview(conflictLabel)
        conflictBar.addSubview(reloadButton)
        conflictBar.addSubview(overwriteButton)
        backgroundView.addSubview(statusPill)
        backgroundView.addSubview(scrollView)
        view.addSubview(backgroundView)

        NSLayoutConstraint.activate([
            backgroundView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backgroundView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backgroundView.topAnchor.constraint(equalTo: view.topAnchor),
            backgroundView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            conflictBar.leadingAnchor.constraint(equalTo: backgroundView.leadingAnchor),
            conflictBar.trailingAnchor.constraint(equalTo: backgroundView.trailingAnchor),
            conflictBar.topAnchor.constraint(equalTo: backgroundView.topAnchor),
            conflictBar.heightAnchor.constraint(equalToConstant: 44),

            conflictLabel.leadingAnchor.constraint(equalTo: conflictBar.leadingAnchor, constant: 18),
            conflictLabel.centerYAnchor.constraint(equalTo: conflictBar.centerYAnchor),

            overwriteButton.trailingAnchor.constraint(equalTo: conflictBar.trailingAnchor, constant: -18),
            overwriteButton.centerYAnchor.constraint(equalTo: conflictBar.centerYAnchor),

            reloadButton.trailingAnchor.constraint(equalTo: overwriteButton.leadingAnchor, constant: -10),
            reloadButton.centerYAnchor.constraint(equalTo: conflictBar.centerYAnchor),

            statusPill.leadingAnchor.constraint(equalTo: backgroundView.leadingAnchor, constant: 22),
            statusPill.topAnchor.constraint(equalTo: conflictBar.bottomAnchor, constant: 12),

            scrollView.leadingAnchor.constraint(equalTo: backgroundView.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: backgroundView.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: statusPill.bottomAnchor, constant: 10),
            scrollView.bottomAnchor.constraint(equalTo: backgroundView.bottomAnchor),
        ])

        apply(theme: .default)
    }

    private func updateMetrics() {
        delegate?.editorViewController(self, didUpdateMetrics: TextMetricsService.metrics(for: textView.string, selectedLocation: textView.selectedRange().location))
    }
}
