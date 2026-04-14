import Foundation

struct AppPaths {
    let rootURL: URL
    let configURL: URL
    let vaultURL: URL
    let assetsURL: URL

    init(homeURL: URL = FileManager.default.homeDirectoryForCurrentUser) {
        rootURL = homeURL.appendingPathComponent(".karabiner", isDirectory: true)
        configURL = rootURL.appendingPathComponent("config.json", isDirectory: false)
        vaultURL = rootURL.appendingPathComponent("vault", isDirectory: true)
        assetsURL = rootURL.appendingPathComponent("assets", isDirectory: true)
    }

    func ensureExists(defaultConfig: AppConfig = .default) throws {
        let fileManager = FileManager.default

        try fileManager.createDirectory(at: rootURL, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: vaultURL, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: assetsURL, withIntermediateDirectories: true)

        guard !fileManager.fileExists(atPath: configURL.path) else {
            return
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(defaultConfig)
        try data.write(to: configURL, options: .atomic)
    }
}
