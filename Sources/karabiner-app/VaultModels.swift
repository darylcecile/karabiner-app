import AppKit
import Foundation
import UniformTypeIdentifiers

struct CollectionStyle: Codable, Equatable {
    var sfSymbol: String?
    var tintHex: String?
}

enum VaultNodeKind: Equatable {
    case collection(style: CollectionStyle?)
    case document
}

final class VaultNode: NSObject {
    let url: URL
    let kind: VaultNodeKind
    let children: [VaultNode]

    var displayName: String {
        if case .document = kind {
            return url.deletingPathExtension().lastPathComponent
        }

        return url.lastPathComponent
    }

    init(url: URL, kind: VaultNodeKind, children: [VaultNode] = []) {
        self.url = url
        self.kind = kind
        self.children = children
    }

    var isCollection: Bool {
        if case .collection = kind {
            return true
        }

        return false
    }

    var symbolName: String {
        switch kind {
        case let .collection(style):
            return style?.sfSymbol?.isEmpty == false ? style!.sfSymbol! : "folder.fill"
        case .document:
            return "doc.text"
        }
    }

    var tintColor: NSColor? {
        guard case let .collection(style) = kind else {
            return nil
        }

        return NSColor(hex: style?.tintHex)
    }
}

struct AssetItem: Equatable {
    let url: URL
    let displayName: String
    let type: UTType?
}

final class VaultIndex {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func buildTree(vaultURL: URL) -> [VaultNode] {
        let children = (try? fileManager.contentsOfDirectory(at: vaultURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])) ?? []

        return children
            .compactMap { makeNode(for: $0) }
            .sorted(by: sortComparator)
    }

    func firstDocument(in nodes: [VaultNode]) -> VaultNode? {
        for node in nodes {
            if case .document = node.kind {
                return node
            }

            if let document = firstDocument(in: node.children) {
                return document
            }
        }

        return nil
    }

    private func makeNode(for url: URL) -> VaultNode? {
        guard let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]) else {
            return nil
        }

        guard values.isSymbolicLink != true else {
            return nil
        }

        if values.isDirectory == true {
            let metadata = loadStyle(from: url.appendingPathComponent(".collection.json", isDirectory: false))
            let children = (try? fileManager.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])) ?? []

            let nestedNodes = children
                .filter { $0.lastPathComponent != ".collection.json" }
                .compactMap { makeNode(for: $0) }
                .sorted(by: sortComparator)

            return VaultNode(url: url, kind: .collection(style: metadata), children: nestedNodes)
        }

        guard ["md", "markdown"].contains(url.pathExtension.lowercased()) else {
            return nil
        }

        return VaultNode(url: url, kind: .document)
    }

    private func loadStyle(from url: URL) -> CollectionStyle? {
        guard let data = try? Data(contentsOf: url) else {
            return nil
        }

        return try? JSONDecoder().decode(CollectionStyle.self, from: data)
    }

    private var sortComparator: (VaultNode, VaultNode) -> Bool {
        { lhs, rhs in
            if lhs.isCollection != rhs.isCollection {
                return lhs.isCollection && !rhs.isCollection
            }

            return lhs.displayName.localizedStandardCompare(rhs.displayName) == .orderedAscending
        }
    }
}

final class AssetIndex {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func buildAssets(assetsURL: URL) -> [AssetItem] {
        guard let enumerator = fileManager.enumerator(at: assetsURL, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles]) else {
            return []
        }

        var results: [AssetItem] = []
        for case let url as URL in enumerator {
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values?.isSymbolicLink != true else {
                continue
            }
            guard values?.isRegularFile == true else {
                continue
            }

            results.append(AssetItem(url: url, displayName: url.lastPathComponent, type: UTType(filenameExtension: url.pathExtension)))
        }

        return results.sorted { lhs, rhs in
            lhs.displayName.localizedStandardCompare(rhs.displayName) == .orderedAscending
        }
    }
}

enum TextMetricsService {
    static func metrics(for text: String, selectedLocation: Int) -> TextMetrics {
        let characters = text.count
        let words = text.split { $0.isWhitespace || $0.isNewline }.count
        let lines = max(text.split(separator: "\n", omittingEmptySubsequences: false).count, 1)

        let safeLocation = max(0, min(selectedLocation, text.utf16.count))
        let utf16View = text.utf16
        let index = utf16View.index(utf16View.startIndex, offsetBy: safeLocation)
        let prefix = String(utf16View[..<index]) ?? ""
        let currentLine = max(prefix.split(separator: "\n", omittingEmptySubsequences: false).count, 1)

        return TextMetrics(characters: characters, words: words, lines: lines, currentLine: currentLine)
    }
}

struct TextMetrics: Equatable {
    let characters: Int
    let words: Int
    let lines: Int
    let currentLine: Int
}

extension String {
    init?(_ utf16: String.UTF16View.SubSequence) {
        self.init(decoding: utf16, as: UTF16.self)
    }
}
