import AppKit
import Foundation

enum SessionStore {
    private static let modeKey = "contentMode"
    private static let selectedDocumentKey = "selectedDocumentPath"

    static func loadContentMode(default fallback: ContentMode) -> ContentMode {
        let value = UserDefaults.standard.string(forKey: modeKey)
        return value.flatMap(ContentMode.init(rawValue:)) ?? fallback
    }

    static func saveContentMode(_ mode: ContentMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: modeKey)
    }

    static func loadSelectedDocumentURL() -> URL? {
        guard let path = UserDefaults.standard.string(forKey: selectedDocumentKey) else {
            return nil
        }

        return URL(fileURLWithPath: path)
    }

    static func saveSelectedDocumentURL(_ url: URL?) {
        UserDefaults.standard.set(url?.path, forKey: selectedDocumentKey)
    }
}

@MainActor
final class PollingMonitor {
    private let urls: [URL]
    private let interval: TimeInterval
    private let handler: () -> Void
    private var timer: Timer?
    private var lastSnapshot = ""

    init(urls: [URL], interval: TimeInterval = 1.0, handler: @escaping () -> Void) {
        self.urls = urls
        self.interval = interval
        self.handler = handler
    }

    func start() {
        guard timer == nil else {
            return
        }

        lastSnapshot = snapshotSignature()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.poll()
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func poll() {
        let snapshot = snapshotSignature()
        guard snapshot != lastSnapshot else {
            return
        }

        lastSnapshot = snapshot
        handler()
    }

    private func snapshotSignature() -> String {
        let fileManager = FileManager.default
        var components: [String] = []

        for url in urls {
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
                components.append("missing:\(url.path)")
                continue
            }

            if isDirectory.boolValue {
                components.append(contentsOf: directorySignature(at: url))
            } else {
                components.append(fileSignature(at: url))
            }
        }

        return components.sorted().joined(separator: "\n")
    }

    private func directorySignature(at url: URL) -> [String] {
        let fileManager = FileManager.default
        guard let enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.contentModificationDateKey, .isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles]) else {
            return ["dir:\(url.path)"]
        }

        var items = ["dir:\(url.path)"]
        for case let childURL as URL in enumerator {
            items.append(fileSignature(at: childURL))
        }
        return items.sorted()
    }

    private func fileSignature(at url: URL) -> String {
        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey, .isDirectoryKey])
        let timestamp = values?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let size = values?.fileSize ?? 0
        let kind = values?.isDirectory == true ? "dir" : "file"
        return "\(kind):\(url.path):\(timestamp):\(size)"
    }
}

extension NSColor {
    convenience init?(hex: String?) {
        guard var hex else {
            return nil
        }

        hex = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hex = hex.replacingOccurrences(of: "#", with: "")

        guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else {
            return nil
        }

        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        let alpha: CGFloat
        if hex.count == 8 {
            red = CGFloat((value & 0xFF00_0000) >> 24) / 255
            green = CGFloat((value & 0x00FF_0000) >> 16) / 255
            blue = CGFloat((value & 0x0000_FF00) >> 8) / 255
            alpha = CGFloat(value & 0x0000_00FF) / 255
        } else {
            red = CGFloat((value & 0xFF0000) >> 16) / 255
            green = CGFloat((value & 0x00FF00) >> 8) / 255
            blue = CGFloat(value & 0x0000FF) / 255
            alpha = 1
        }

        self.init(srgbRed: red, green: green, blue: blue, alpha: alpha)
    }

    var hexString: String? {
        guard let color = usingColorSpace(.sRGB) else {
            return nil
        }

        let red = Int(round(color.redComponent * 255))
        let green = Int(round(color.greenComponent * 255))
        let blue = Int(round(color.blueComponent * 255))
        return String(format: "#%02X%02X%02X", red, green, blue)
    }
}

extension URL {
    func isDescendant(of folderURL: URL) -> Bool {
        standardizedFileURL.path.hasPrefix(folderURL.standardizedFileURL.path)
    }
}

enum FileSystemWriter {
    static func uniqueDirectory(in parentURL: URL, baseName: String) -> URL {
        uniqueURL(in: parentURL, baseName: baseName, pathExtension: nil)
    }

    static func uniqueMarkdownFile(in parentURL: URL, baseName: String) -> URL {
        uniqueURL(in: parentURL, baseName: baseName, pathExtension: "md")
    }

    static func writeCollectionStyle(_ style: CollectionStyle, to folderURL: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(style)
        try data.write(to: folderURL.appendingPathComponent(".collection.json"), options: .atomic)
    }

    private static func uniqueURL(in parentURL: URL, baseName: String, pathExtension: String?) -> URL {
        let fileManager = FileManager.default
        let sanitizedBaseName = sanitized(baseName)

        for index in 0..<10_000 {
            let suffix = index == 0 ? "" : " \(index + 1)"
            let name = sanitizedBaseName + suffix
            var url = parentURL.appendingPathComponent(name, isDirectory: pathExtension == nil)
            if let pathExtension {
                url.deletePathExtension()
                url.appendPathExtension(pathExtension)
            }

            if !fileManager.fileExists(atPath: url.path) {
                return url
            }
        }

        return parentURL.appendingPathComponent(UUID().uuidString, isDirectory: pathExtension == nil)
    }

    private static func sanitized(_ string: String) -> String {
        let invalidCharacters = CharacterSet(charactersIn: "/:")
        let components = string.components(separatedBy: invalidCharacters)
        let joined = components.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return joined.isEmpty ? "Untitled" : joined
    }
}
