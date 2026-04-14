import AppKit
import Foundation

struct DocumentRevision: Equatable {
    let modificationDate: TimeInterval
    let fileSize: Int
    let fileIdentifier: Data?
}

enum DocumentSaveState: Equatable {
    case clean
    case dirty
    case saving
    case conflict
    case missing
    case error(String)

    var statusText: String {
        switch self {
        case .clean:
            return "Saved"
        case .dirty:
            return "Edited"
        case .saving:
            return "Saving…"
        case .conflict:
            return "Changed on disk"
        case .missing:
            return "Missing on disk"
        case let .error(message):
            return message
        }
    }
}

struct DocumentSessionSnapshot: Equatable {
    let url: URL?
    let saveState: DocumentSaveState
    let isDirty: Bool
}

struct DocumentPayload {
    let text: String
    let encoding: String.Encoding
    let revision: DocumentRevision
}

enum DocumentStore {
    static func load(from url: URL) throws -> DocumentPayload {
        var encodingValue: UInt = String.Encoding.utf8.rawValue
        do {
            let contents = try NSString(contentsOf: url, usedEncoding: &encodingValue)
            let encoding = String.Encoding(rawValue: encodingValue)
            return DocumentPayload(text: contents as String, encoding: encoding, revision: try revision(for: url))
        } catch {
            throw NSError(
                domain: "KarabinerDocumentError",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "The note couldn’t be decoded as plain text."]
            )
        }
    }

    @discardableResult
    static func save(text: String, encoding: String.Encoding, to url: URL) throws -> DocumentRevision {
        try text.write(to: url, atomically: true, encoding: encoding)
        return try revision(for: url)
    }

    static func revision(for url: URL) throws -> DocumentRevision {
        let values = try url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey, .fileResourceIdentifierKey])
        return DocumentRevision(
            modificationDate: values.contentModificationDate?.timeIntervalSince1970 ?? 0,
            fileSize: values.fileSize ?? 0,
            fileIdentifier: values.fileResourceIdentifier as? Data
        )
    }
}

final class DocumentFileObserver {
    private var fileDescriptor: CInt = -1
    private var source: DispatchSourceFileSystemObject?

    init(url: URL, onChange: @escaping () -> Void) throws {
        try start(url: url, onChange: onChange)
    }

    func stop() {
        source?.cancel()
        source = nil
        if fileDescriptor >= 0 {
            close(fileDescriptor)
            fileDescriptor = -1
        }
    }

    deinit {
        stop()
    }

    private func start(url: URL, onChange: @escaping () -> Void) throws {
        fileDescriptor = open(url.path, O_EVTONLY)
        guard fileDescriptor >= 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fileDescriptor,
            eventMask: [.write, .rename, .delete, .attrib, .extend, .revoke],
            queue: .main
        )
        source.setEventHandler(handler: onChange)
        source.setCancelHandler { [fileDescriptor] in
            if fileDescriptor >= 0 {
                close(fileDescriptor)
            }
        }
        source.resume()
        self.source = source
    }
}

@MainActor
final class DocumentSession {
    var onReloadText: ((String) -> Void)?
    var onSnapshotChange: ((DocumentSessionSnapshot) -> Void)?

    private(set) var currentURL: URL?
    private(set) var text = ""

    private var encoding: String.Encoding = .utf8
    private var lastSavedRevision: DocumentRevision?
    private var snapshot = DocumentSessionSnapshot(url: nil, saveState: .clean, isDirty: false)
    private var autosaveWorkItem: DispatchWorkItem?
    private var observer: DocumentFileObserver?
    private var ignoreObservedEventsUntil = Date.distantPast

    func open(_ url: URL) throws {
        if currentURL?.standardizedFileURL == url.standardizedFileURL {
            return
        }

        flushAutosave()
        observer?.stop()

        let payload = try DocumentStore.load(from: url)
        currentURL = url
        text = payload.text
        encoding = payload.encoding
        lastSavedRevision = payload.revision
        snapshot = DocumentSessionSnapshot(url: url, saveState: .clean, isDirty: false)
        emitSnapshot()

        observer = try DocumentFileObserver(url: url) { [weak self] in
            Task { @MainActor in
                self?.handleObservedFileChange()
            }
        }
    }

    func applyTextChange(_ text: String) {
        guard currentURL != nil else {
            return
        }

        self.text = text
        guard snapshot.saveState != .conflict, snapshot.saveState != .missing else {
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: snapshot.saveState, isDirty: true)
            emitSnapshot()
            return
        }

        snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .dirty, isDirty: true)
        emitSnapshot()
        scheduleAutosave()
    }

    func flushAutosave() {
        autosaveWorkItem?.cancel()
        autosaveWorkItem = nil

        guard snapshot.isDirty else {
            return
        }

        saveNow(force: true)
    }

    func close() {
        flushAutosave()
        observer?.stop()
        observer = nil
        currentURL = nil
        text = ""
        snapshot = DocumentSessionSnapshot(url: nil, saveState: .clean, isDirty: false)
        emitSnapshot()
    }

    func reloadFromDisk() throws {
        guard let currentURL else {
            return
        }

        let payload = try DocumentStore.load(from: currentURL)
        text = payload.text
        encoding = payload.encoding
        lastSavedRevision = payload.revision
        snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .clean, isDirty: false)
        onReloadText?(payload.text)
        emitSnapshot()
    }

    func overwriteDisk() {
        saveNow(force: true)
    }

    func handleWorkspaceContentChange(_ changedURLs: Set<URL>) {
        guard let currentURL, changedURLs.contains(currentURL.standardizedFileURL) else {
            return
        }

        handleObservedFileChange()
    }

    func currentSnapshot() -> DocumentSessionSnapshot {
        snapshot
    }

    private func scheduleAutosave() {
        autosaveWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                self?.saveNow(force: false)
            }
        }

        autosaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: workItem)
    }

    private func saveNow(force: Bool) {
        guard let currentURL else {
            return
        }

        if !force && (!snapshot.isDirty || snapshot.saveState == .conflict || snapshot.saveState == .missing) {
            return
        }

        autosaveWorkItem?.cancel()
        autosaveWorkItem = nil
        snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .saving, isDirty: true)
        emitSnapshot()

        do {
            ignoreObservedEventsUntil = Date().addingTimeInterval(0.75)
            lastSavedRevision = try DocumentStore.save(text: text, encoding: encoding, to: currentURL)
            observer?.stop()
            observer = try? DocumentFileObserver(url: currentURL) { [weak self] in
                Task { @MainActor in
                    self?.handleObservedFileChange()
                }
            }
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .clean, isDirty: false)
        } catch {
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .error("Save failed"), isDirty: true)
        }

        emitSnapshot()
    }

    private func handleObservedFileChange() {
        guard let currentURL else {
            return
        }

        guard Date() >= ignoreObservedEventsUntil else {
            return
        }

        guard let revision = try? DocumentStore.revision(for: currentURL) else {
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .missing, isDirty: snapshot.isDirty)
            emitSnapshot()
            return
        }

        guard revision != lastSavedRevision else {
            return
        }

        if snapshot.isDirty {
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .conflict, isDirty: true)
            emitSnapshot()
            return
        }

        do {
            let payload = try DocumentStore.load(from: currentURL)
            text = payload.text
            encoding = payload.encoding
            lastSavedRevision = payload.revision
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .clean, isDirty: false)
            onReloadText?(payload.text)
        } catch {
            snapshot = DocumentSessionSnapshot(url: currentURL, saveState: .error("Reload failed"), isDirty: false)
        }

        emitSnapshot()
    }

    private func emitSnapshot() {
        onSnapshotChange?(snapshot)
    }
}
