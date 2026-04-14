import Testing
@testable import karabiner_app
import Foundation

@Test func appConfigDecodesWithDefaults() throws {
    let json = Data("{}".utf8)
    let config = try JSONDecoder().decode(AppConfig.self, from: json)

    #expect(config.sidebarSide == .left)
    #expect(config.defaultContentMode == .vault)
    #expect(config.theme.appearance == .system)
}

@Test func textMetricsCountsWordsLinesAndCursorLine() {
    let text = "Hello world\n\nThis is Karabiner"
    let metrics = TextMetricsService.metrics(for: text, selectedLocation: 13)

    #expect(metrics.characters == text.count)
    #expect(metrics.words == 5)
    #expect(metrics.lines == 3)
    #expect(metrics.currentLine == 3)
}

@Test func fileSystemWriterCreatesSanitizedMarkdownName() {
    let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDirectory) }

    let url = FileSystemWriter.uniqueMarkdownFile(in: tempDirectory, baseName: "work:/notes")
    #expect(url.lastPathComponent == "work  notes.md")
}

@Test func vaultIndexSkipsSymlinkedDirectories() throws {
    let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    let outsideDirectory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    let fileManager = FileManager.default

    try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    try fileManager.createDirectory(at: outsideDirectory, withIntermediateDirectories: true)
    defer {
        try? fileManager.removeItem(at: tempDirectory)
        try? fileManager.removeItem(at: outsideDirectory)
    }

    let noteURL = tempDirectory.appendingPathComponent("Readme.md")
    try "# Hello".write(to: noteURL, atomically: true, encoding: .utf8)

    let symlinkURL = tempDirectory.appendingPathComponent("escape", isDirectory: true)
    try fileManager.createSymbolicLink(at: symlinkURL, withDestinationURL: outsideDirectory)

    let nodes = VaultIndex().buildTree(vaultURL: tempDirectory)

    #expect(nodes.count == 1)
    #expect(nodes.first?.displayName == "Readme")
}

@Test func documentSessionMarksDirtyAndAutosaves() async throws {
    let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    let fileManager = FileManager.default
    try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: tempDirectory) }

    let noteURL = tempDirectory.appendingPathComponent("Draft.md")
    try "Hello".write(to: noteURL, atomically: true, encoding: .utf8)

    let session = await MainActor.run { DocumentSession() }
    try await MainActor.run {
        try session.open(noteURL)
        session.applyTextChange("Hello world")
    }

    try await Task.sleep(for: .milliseconds(800))

    let contents = try String(contentsOf: noteURL, encoding: .utf8)
    let snapshot = await MainActor.run { session.currentSnapshot() }
    #expect(contents == "Hello world")
    #expect(snapshot.saveState == .clean)
    #expect(snapshot.isDirty == false)
}

@Test func documentSessionDetectsExternalConflictWhenDirty() async throws {
    let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    let fileManager = FileManager.default
    try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: tempDirectory) }

    let noteURL = tempDirectory.appendingPathComponent("Conflict.md")
    try "Original".write(to: noteURL, atomically: true, encoding: .utf8)

    let session = await MainActor.run { DocumentSession() }
    try await MainActor.run {
        try session.open(noteURL)
        session.applyTextChange("Local edit")
    }

    try "External edit".write(to: noteURL, atomically: true, encoding: .utf8)
    try await MainActor.run {
        session.handleWorkspaceContentChange([noteURL.standardizedFileURL])
    }

    let snapshot = await MainActor.run { session.currentSnapshot() }
    #expect(snapshot.saveState == .conflict)
    #expect(snapshot.isDirty == true)
}
