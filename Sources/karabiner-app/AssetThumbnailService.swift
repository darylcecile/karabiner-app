import AppKit
import Foundation
import QuickLookThumbnailing

@MainActor
final class AssetThumbnailService {
    static let shared = AssetThumbnailService()

    private let cache = NSCache<NSString, NSImage>()

    func thumbnail(for asset: AssetItem, size: CGSize, completion: @escaping @MainActor (NSImage) -> Void) {
        let cacheKey = thumbnailKey(for: asset.url, size: size)
        if let image = cache.object(forKey: cacheKey as NSString) {
            completion(image)
            return
        }

        let request = QLThumbnailGenerator.Request(
            fileAt: asset.url,
            size: size,
            scale: NSScreen.main?.backingScaleFactor ?? 2,
            representationTypes: .thumbnail
        )

        QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { [weak self] representation, _ in
            let image = representation?.nsImage ?? NSWorkspace.shared.icon(forFile: asset.url.path)
            Task { @MainActor in
                self?.cache.setObject(image, forKey: cacheKey as NSString)
                completion(image)
            }
        }
    }

    private func thumbnailKey(for url: URL, size: CGSize) -> String {
        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let stamp = values?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let fileSize = values?.fileSize ?? 0
        return "\(url.path)|\(Int(size.width))x\(Int(size.height))|\(stamp)|\(fileSize)"
    }
}
