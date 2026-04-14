import AppKit

@MainActor
class SheetHostingController<Result>: NSViewController {
    var result: Result?

    func submit(_ value: Result) {
        result = value
        guard let window = view.window else {
            return
        }
        NSApp.stopModal()
        window.sheetParent?.endSheet(window, returnCode: .OK)
    }

    func cancel() {
        guard let window = view.window else {
            return
        }
        NSApp.stopModal()
        window.sheetParent?.endSheet(window, returnCode: .cancel)
    }
}

@MainActor
final class NoteSheetController: SheetHostingController<String> {
    private let nameField: NSTextField

    init(initialName: String) {
        nameField = NSTextField(string: initialName)
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
        preferredContentSize = NSSize(width: 420, height: 170)

        let titleLabel = NSTextField(labelWithString: "New Note")
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)

        let subtitleLabel = NSTextField(labelWithString: "Create a markdown document in the selected collection.")
        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textColor = .secondaryLabelColor

        nameField.placeholderString = "Note name"

        let buttons = sheetButtons(cancelTarget: self, cancelAction: #selector(handleCancel(_:)), confirmTarget: self, confirmTitle: "Create", confirmAction: #selector(handleCreate(_:)))
        let content = sheetStack(titleLabel: titleLabel, subtitleLabel: subtitleLabel, bodyViews: [labeledField(title: "Name", field: nameField)], buttons: buttons)
        view.addSubview(content)
        NSLayoutConstraint.activate(sheetConstraints(for: content))
    }

    @objc private func handleCreate(_ sender: Any?) {
        let value = nameField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        submit(value.isEmpty ? "Untitled" : value)
    }

    @objc private func handleCancel(_ sender: Any?) {
        cancel()
    }
}

@MainActor
final class CollectionSheetController: SheetHostingController<CollectionDraft>, NSTextFieldDelegate {
    private let nameField: NSTextField
    private let symbolPopup = NSPopUpButton()
    private let colorWell = NSColorWell()
    private let previewSymbol = NSImageView()
    private let previewName = NSTextField(labelWithString: "")
    private let symbolOptions = ["folder.fill", "briefcase.fill", "hammer.fill", "sparkles", "pencil.and.scribble", "shippingbox.fill"]

    init(existing: CollectionDraft?) {
        nameField = NSTextField(string: existing?.name ?? "New Collection")
        super.init(nibName: nil, bundle: nil)

        if let sfSymbol = existing?.style.sfSymbol, symbolOptions.contains(sfSymbol) {
            symbolPopup.addItems(withTitles: symbolOptions)
            symbolPopup.selectItem(withTitle: sfSymbol)
        }

        colorWell.color = NSColor(hex: existing?.style.tintHex) ?? .controlAccentColor
        previewName.stringValue = existing?.name ?? "New Collection"
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
        preferredContentSize = NSSize(width: 460, height: 300)

        let titleLabel = NSTextField(labelWithString: "Collection Style")
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)

        let subtitleLabel = NSTextField(labelWithString: "Collections live as folders in your vault with a small amount of visual metadata.")
        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.lineBreakMode = .byWordWrapping

        if symbolPopup.numberOfItems == 0 {
            symbolPopup.addItems(withTitles: symbolOptions)
        }
        symbolPopup.target = self
        symbolPopup.action = #selector(updatePreview(_:))

        colorWell.target = self
        colorWell.action = #selector(updatePreview(_:))

        nameField.placeholderString = "Collection name"
        nameField.delegate = self

        let previewCard = previewView()
        let buttons = sheetButtons(cancelTarget: self, cancelAction: #selector(handleCancel(_:)), confirmTarget: self, confirmTitle: "Save", confirmAction: #selector(handleSave(_:)))
        let content = sheetStack(
            titleLabel: titleLabel,
            subtitleLabel: subtitleLabel,
            bodyViews: [
                labeledField(title: "Name", field: nameField),
                labeledField(title: "Symbol", field: symbolPopup),
                labeledField(title: "Tint", field: colorWell),
                previewCard,
            ],
            buttons: buttons
        )

        view.addSubview(content)
        NSLayoutConstraint.activate(sheetConstraints(for: content))
        updatePreview(nil)
    }

    func controlTextDidChange(_ obj: Notification) {
        updatePreview(nil)
    }

    @objc private func updatePreview(_ sender: Any?) {
        let name = nameField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        previewName.stringValue = name.isEmpty ? "New Collection" : name
        let image = NSImage(systemSymbolName: symbolPopup.titleOfSelectedItem ?? "folder.fill", accessibilityDescription: nil)
        image?.isTemplate = false
        previewSymbol.image = image
        previewSymbol.contentTintColor = colorWell.color
    }

    @objc private func handleSave(_ sender: Any?) {
        let name = nameField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        submit(CollectionDraft(name: name.isEmpty ? "New Collection" : name, style: CollectionStyle(sfSymbol: symbolPopup.titleOfSelectedItem, tintHex: colorWell.color.hexString)))
    }

    @objc private func handleCancel(_ sender: Any?) {
        cancel()
    }

    private func previewView() -> NSView {
        let card = NSView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.wantsLayer = true
        card.layer?.cornerRadius = 14
        card.layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.7).cgColor
        card.layer?.borderWidth = 1
        card.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.4).cgColor

        previewSymbol.translatesAutoresizingMaskIntoConstraints = false
        previewSymbol.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 20, weight: .medium)

        previewName.translatesAutoresizingMaskIntoConstraints = false
        previewName.font = .systemFont(ofSize: 14, weight: .semibold)

        card.addSubview(previewSymbol)
        card.addSubview(previewName)

        NSLayoutConstraint.activate([
            card.heightAnchor.constraint(equalToConstant: 66),
            previewSymbol.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            previewSymbol.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            previewSymbol.widthAnchor.constraint(equalToConstant: 24),
            previewSymbol.heightAnchor.constraint(equalToConstant: 24),
            previewName.leadingAnchor.constraint(equalTo: previewSymbol.trailingAnchor, constant: 12),
            previewName.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            previewName.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -16),
        ])

        return card
    }
}

@MainActor
private func sheetStack(titleLabel: NSTextField, subtitleLabel: NSTextField, bodyViews: [NSView], buttons: NSView) -> NSView {
    let stack = NSStackView(views: [titleLabel, subtitleLabel] + bodyViews + [buttons])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 14
    stack.translatesAutoresizingMaskIntoConstraints = false
    return stack
}

@MainActor
private func sheetButtons(cancelTarget: AnyObject, cancelAction: Selector, confirmTarget: AnyObject, confirmTitle: String, confirmAction: Selector) -> NSView {
    let cancelButton = NSButton(title: "Cancel", target: cancelTarget, action: cancelAction)
    cancelButton.bezelStyle = .recessed

    let confirmButton = NSButton(title: confirmTitle, target: confirmTarget, action: confirmAction)
    confirmButton.bezelStyle = .rounded
    confirmButton.keyEquivalent = "\r"

    let stack = NSStackView(views: [cancelButton, confirmButton])
    stack.orientation = .horizontal
    stack.spacing = 10
    return stack
}

@MainActor
private func labeledField(title: String, field: NSView) -> NSView {
    let label = NSTextField(labelWithString: title)
    label.font = .systemFont(ofSize: 12, weight: .semibold)
    field.translatesAutoresizingMaskIntoConstraints = false
    field.widthAnchor.constraint(equalToConstant: 360).isActive = true

    let stack = NSStackView(views: [label, field])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 6
    return stack
}

@MainActor
private func sheetConstraints(for content: NSView) -> [NSLayoutConstraint] {
    guard let superview = content.superview else {
        return []
    }

    return [
        content.leadingAnchor.constraint(equalTo: superview.leadingAnchor, constant: 24),
        content.trailingAnchor.constraint(equalTo: superview.trailingAnchor, constant: -24),
        content.topAnchor.constraint(equalTo: superview.topAnchor, constant: 24),
        content.bottomAnchor.constraint(lessThanOrEqualTo: superview.bottomAnchor, constant: -24),
    ]
}
