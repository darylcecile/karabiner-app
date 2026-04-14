// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "karabiner-app",
    platforms: [
        .macOS(.v14),
    ],
    targets: [
        .executableTarget(
            name: "karabiner-app"
        ),
        .testTarget(
            name: "karabiner-appTests",
            dependencies: ["karabiner-app"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
