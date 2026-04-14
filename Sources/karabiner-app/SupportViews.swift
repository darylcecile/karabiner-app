import AppKit

final class EmptyStateViewController: NSViewController {
    private let titleText: String
    private let subtitleText: String
    private let primaryTitle: String
    private let secondaryTitle: String?
    private let primaryAction: () -> Void
    private let secondaryAction: (() -> Void)?

    init(title: String, subtitle: String, primaryTitle: String, secondaryTitle: String?, primaryAction: @escaping () -> Void, secondaryAction: (() -> Void)?) {
        titleText = title
        subtitleText = subtitle
        self.primaryTitle = primaryTitle
        self.secondaryTitle = secondaryTitle
        self.primaryAction = primaryAction
        self.secondaryAction = secondaryAction
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

        let titleLabel = NSTextField(wrappingLabelWithString: titleText)
        titleLabel.font = .systemFont(ofSize: 22, weight: .semibold)
        titleLabel.alignment = .center

        let subtitleLabel = NSTextField(wrappingLabelWithString: subtitleText)
        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.alignment = .center
        subtitleLabel.maximumNumberOfLines = 3

        let primaryButton = NSButton(title: primaryTitle, target: self, action: #selector(handlePrimaryAction(_:)))
        primaryButton.bezelStyle = .rounded
        primaryButton.keyEquivalent = "\r"

        let buttons: [NSView]
        if let secondaryTitle, secondaryAction != nil {
            let secondaryButton = NSButton(title: secondaryTitle, target: self, action: #selector(handleSecondaryAction(_:)))
            secondaryButton.bezelStyle = .recessed
            buttons = [primaryButton, secondaryButton]
        } else {
            buttons = [primaryButton]
        }

        let buttonStack = NSStackView(views: buttons)
        buttonStack.spacing = 10

        let stack = NSStackView(views: [titleLabel, subtitleLabel, buttonStack])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
        ])
    }

    @objc private func handlePrimaryAction(_ sender: Any?) {
        primaryAction()
    }

    @objc private func handleSecondaryAction(_ sender: Any?) {
        secondaryAction?()
    }
}

final class StatusBarView: NSVisualEffectView {
    private let contextLabel = NSTextField(labelWithString: "")
    private let countsLabel = NSTextField(labelWithString: "No note selected")
    private let separator = NSBox()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        material = .titlebar
        blendingMode = .withinWindow
        state = .followsWindowActiveState
        wantsLayer = true

        contextLabel.font = .systemFont(ofSize: 11, weight: .medium)
        contextLabel.textColor = .secondaryLabelColor
        contextLabel.lineBreakMode = .byTruncatingMiddle

        countsLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        countsLabel.alignment = .right
        countsLabel.textColor = .secondaryLabelColor

        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [contextLabel, countsLabel])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(separator)
        addSubview(stack)

        NSLayoutConstraint.activate([
            separator.leadingAnchor.constraint(equalTo: leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: trailingAnchor),
            separator.topAnchor.constraint(equalTo: topAnchor),

            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setContext(_ text: String) {
        contextLabel.stringValue = text
    }

    func setMetrics(_ metrics: TextMetrics?) {
        guard let metrics else {
            countsLabel.stringValue = "No note selected"
            return
        }

        countsLabel.stringValue = "\(metrics.characters) chars   \(metrics.words) words   Line \(metrics.currentLine)"
    }

    func setStatusText(_ text: String) {
        countsLabel.stringValue = text
    }

    func apply(theme: ThemeConfig) {
        if let tint = NSColor(hex: theme.statusBarTintHex) {
            layer?.backgroundColor = tint.withAlphaComponent(0.08).cgColor
        } else {
            layer?.backgroundColor = NSColor.clear.cgColor
        }
    }
}
