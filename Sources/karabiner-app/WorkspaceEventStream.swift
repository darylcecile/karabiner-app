import CoreServices
import Foundation

struct WorkspaceChangeSet: Equatable {
    var configChanged = false
    var vaultTreeChanged = false
    var assetsChanged = false
    var documentContentChangedURLs = Set<URL>()

    static var initial: WorkspaceChangeSet {
        WorkspaceChangeSet(configChanged: true, vaultTreeChanged: true, assetsChanged: true)
    }

    var hasChanges: Bool {
        configChanged || vaultTreeChanged || assetsChanged || !documentContentChangedURLs.isEmpty
    }

    mutating func merge(_ other: WorkspaceChangeSet) {
        configChanged = configChanged || other.configChanged
        vaultTreeChanged = vaultTreeChanged || other.vaultTreeChanged
        assetsChanged = assetsChanged || other.assetsChanged
        documentContentChangedURLs.formUnion(other.documentContentChangedURLs)
    }
}

enum WorkspaceEventClassifier {
    static func classify(appPaths: AppPaths, changedPaths: [String], flags: [FSEventStreamEventFlags]) -> WorkspaceChangeSet {
        var changeSet = WorkspaceChangeSet()

        for (index, changedPath) in changedPaths.enumerated() {
            let url = URL(fileURLWithPath: changedPath).standardizedFileURL
            let flag = flags.indices.contains(index) ? flags[index] : 0
            let isStructural = flag.containsAny(
                FSEventStreamEventFlags(kFSEventStreamEventFlagItemCreated),
                FSEventStreamEventFlags(kFSEventStreamEventFlagItemRemoved),
                FSEventStreamEventFlags(kFSEventStreamEventFlagItemRenamed),
                FSEventStreamEventFlags(kFSEventStreamEventFlagMustScanSubDirs)
            )

            if url == appPaths.configURL.standardizedFileURL {
                changeSet.configChanged = true
                continue
            }

            if url.isDescendant(of: appPaths.assetsURL) {
                changeSet.assetsChanged = true
                continue
            }

            guard url.isDescendant(of: appPaths.vaultURL) else {
                continue
            }

            if url.lastPathComponent == ".collection.json" {
                changeSet.vaultTreeChanged = true
                continue
            }

            if isStructural {
                changeSet.vaultTreeChanged = true
                continue
            }

            let pathExtension = url.pathExtension.lowercased()
            if ["md", "markdown"].contains(pathExtension) {
                changeSet.documentContentChangedURLs.insert(url)
            } else {
                changeSet.vaultTreeChanged = true
            }
        }

        return changeSet
    }
}

@MainActor
final class WorkspaceEventStream {
    private let appPaths: AppPaths
    private let handler: (WorkspaceChangeSet) -> Void
    private var stream: FSEventStreamRef?
    private var pendingChangeSet = WorkspaceChangeSet()
    private var debounceWorkItem: DispatchWorkItem?

    init(appPaths: AppPaths, handler: @escaping (WorkspaceChangeSet) -> Void) {
        self.appPaths = appPaths
        self.handler = handler
    }

    func start() {
        guard stream == nil else {
            return
        }

        let callback: FSEventStreamCallback = { _, info, eventCount, eventPaths, eventFlags, _ in
            guard let info else {
                return
            }

            let watcher = Unmanaged<WorkspaceEventStream>.fromOpaque(info).takeUnretainedValue()
            let paths = unsafeBitCast(eventPaths, to: NSArray.self) as? [String] ?? []
            let flags = Array(UnsafeBufferPointer(start: eventFlags, count: Int(eventCount)))

            Task { @MainActor in
                watcher.receive(paths: paths, flags: flags)
            }
        }

        var context = FSEventStreamContext(
            version: 0,
            info: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()),
            retain: nil,
            release: nil,
            copyDescription: nil
        )

        let pathsToWatch = [appPaths.rootURL.path] as CFArray
        stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            callback,
            &context,
            pathsToWatch,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            0.15,
            FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes)
        )

        guard let stream else {
            return
        }

        FSEventStreamScheduleWithRunLoop(stream, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        FSEventStreamStart(stream)
    }

    func stop() {
        debounceWorkItem?.cancel()
        debounceWorkItem = nil

        guard let stream else {
            return
        }

        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    private func receive(paths: [String], flags: [FSEventStreamEventFlags]) {
        let changeSet = WorkspaceEventClassifier.classify(appPaths: appPaths, changedPaths: paths, flags: flags)
        guard changeSet.hasChanges else {
            return
        }

        pendingChangeSet.merge(changeSet)
        debounceWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            guard let self else {
                return
            }

            let pending = self.pendingChangeSet
            self.pendingChangeSet = WorkspaceChangeSet()
            self.handler(pending)
        }

        debounceWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: workItem)
    }
}

private extension FSEventStreamEventFlags {
    func containsAny(_ flags: FSEventStreamEventFlags...) -> Bool {
        flags.contains { contains($0) }
    }

    func contains(_ flag: FSEventStreamEventFlags) -> Bool {
        self & flag != 0
    }
}
