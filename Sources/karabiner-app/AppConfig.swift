import AppKit
import Foundation

enum SidebarSide: String, Codable {
    case left
    case right
}

enum ContentMode: String, Codable {
    case vault
    case gallery
}

enum AppAppearance: String, Codable {
    case system
    case light
    case dark

    var nsAppearance: NSAppearance? {
        switch self {
        case .system:
            return nil
        case .light:
            return NSAppearance(named: .aqua)
        case .dark:
            return NSAppearance(named: .darkAqua)
        }
    }
}

enum SidebarMaterial: String, Codable {
    case sidebar
    case hud
    case windowBackground

    var nsMaterial: NSVisualEffectView.Material {
        switch self {
        case .sidebar:
            return .sidebar
        case .hud:
            return .hudWindow
        case .windowBackground:
            return .underWindowBackground
        }
    }
}

struct ThemeConfig: Codable, Equatable {
    var appearance: AppAppearance
    var sidebarMaterial: SidebarMaterial
    var sidebarTintHex: String?
    var sidebarTintAlpha: Double
    var editorBackgroundHex: String?
    var statusBarTintHex: String?

    static let `default` = ThemeConfig(
        appearance: .system,
        sidebarMaterial: .sidebar,
        sidebarTintHex: "#7C5CFF",
        sidebarTintAlpha: 0.10,
        editorBackgroundHex: nil,
        statusBarTintHex: nil
    )

    init(
        appearance: AppAppearance = .system,
        sidebarMaterial: SidebarMaterial = .sidebar,
        sidebarTintHex: String? = "#7C5CFF",
        sidebarTintAlpha: Double = 0.10,
        editorBackgroundHex: String? = nil,
        statusBarTintHex: String? = nil
    ) {
        self.appearance = appearance
        self.sidebarMaterial = sidebarMaterial
        self.sidebarTintHex = sidebarTintHex
        self.sidebarTintAlpha = sidebarTintAlpha
        self.editorBackgroundHex = editorBackgroundHex
        self.statusBarTintHex = statusBarTintHex
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        appearance = try container.decodeIfPresent(AppAppearance.self, forKey: .appearance) ?? ThemeConfig.default.appearance
        sidebarMaterial = try container.decodeIfPresent(SidebarMaterial.self, forKey: .sidebarMaterial) ?? ThemeConfig.default.sidebarMaterial
        sidebarTintHex = try container.decodeIfPresent(String.self, forKey: .sidebarTintHex) ?? ThemeConfig.default.sidebarTintHex
        sidebarTintAlpha = try container.decodeIfPresent(Double.self, forKey: .sidebarTintAlpha) ?? ThemeConfig.default.sidebarTintAlpha
        editorBackgroundHex = try container.decodeIfPresent(String.self, forKey: .editorBackgroundHex)
        statusBarTintHex = try container.decodeIfPresent(String.self, forKey: .statusBarTintHex)
    }
}

struct AppConfig: Codable, Equatable {
    var theme: ThemeConfig
    var sidebarSide: SidebarSide
    var defaultContentMode: ContentMode

    static let `default` = AppConfig(
        theme: .default,
        sidebarSide: .left,
        defaultContentMode: .vault
    )

    init(
        theme: ThemeConfig = .default,
        sidebarSide: SidebarSide = .left,
        defaultContentMode: ContentMode = .vault
    ) {
        self.theme = theme
        self.sidebarSide = sidebarSide
        self.defaultContentMode = defaultContentMode
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        theme = try container.decodeIfPresent(ThemeConfig.self, forKey: .theme) ?? .default
        sidebarSide = try container.decodeIfPresent(SidebarSide.self, forKey: .sidebarSide) ?? .left
        defaultContentMode = try container.decodeIfPresent(ContentMode.self, forKey: .defaultContentMode) ?? .vault
    }
}

final class ConfigStore {
    private let paths: AppPaths

    init(paths: AppPaths) {
        self.paths = paths
    }

    func load() -> AppConfig {
        do {
            let data = try Data(contentsOf: paths.configURL)
            return try JSONDecoder().decode(AppConfig.self, from: data)
        } catch {
            return .default
        }
    }
}
