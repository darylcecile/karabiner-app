import Foundation

public struct RemoteRuntimeID: RawRepresentable, Codable, Hashable, Sendable, ExpressibleByStringLiteral {
    public var rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(stringLiteral value: String) {
        self.rawValue = value
    }
}

public enum RemoteRuntimeKind: String, Codable, Hashable, Sendable {
    case codespace
    case sshTarget
    case desktopCompanion
    case openCodeServer
    case claudeRemoteControl
    case codexRemoteRuntime
    case genericHTTPS
}

public struct RemoteRuntimeEndpoint: Codable, Hashable, Sendable, Identifiable {
    public var id: RemoteRuntimeID
    public var displayName: String
    public var kind: RemoteRuntimeKind
    public var healthURL: URL
    public var headers: [String: String]
    public var allowsInsecureLocalNetwork: Bool
    public var expectedServerID: String?

    public init(
        id: RemoteRuntimeID,
        displayName: String,
        kind: RemoteRuntimeKind,
        healthURL: URL,
        headers: [String: String] = [:],
        allowsInsecureLocalNetwork: Bool = false,
        expectedServerID: String? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.kind = kind
        self.healthURL = healthURL
        self.headers = headers
        self.allowsInsecureLocalNetwork = allowsInsecureLocalNetwork
        self.expectedServerID = expectedServerID
    }
}

public enum RemoteRuntimeHealthStatus: String, Codable, Hashable, Sendable {
    case online
    case degraded
    case offline
    case untrusted
    case unsupported
}

public struct RemoteRuntimeHealth: Codable, Hashable, Sendable {
    public var runtimeID: RemoteRuntimeID
    public var status: RemoteRuntimeHealthStatus
    public var message: String
    public var checkedAt: Date
    public var latencyMilliseconds: Double?
    public var version: String?
    public var capabilities: [String]

    public init(
        runtimeID: RemoteRuntimeID,
        status: RemoteRuntimeHealthStatus,
        message: String,
        checkedAt: Date = Date(),
        latencyMilliseconds: Double? = nil,
        version: String? = nil,
        capabilities: [String] = []
    ) {
        self.runtimeID = runtimeID
        self.status = status
        self.message = message
        self.checkedAt = checkedAt
        self.latencyMilliseconds = latencyMilliseconds
        self.version = version
        self.capabilities = capabilities
    }
}

public enum RemoteRuntimeHealthError: Error, LocalizedError, Equatable, Sendable {
    case insecureEndpoint(URL)
    case invalidResponse
    case untrustedRuntime(expected: String, actual: String?)

    public var errorDescription: String? {
        switch self {
        case .insecureEndpoint(let url):
            "Runtime health endpoint is not trusted: \(url.absoluteString)"
        case .invalidResponse:
            "Runtime health endpoint returned an invalid response."
        case .untrustedRuntime(let expected, let actual):
            "Runtime identity mismatch. Expected \(expected), got \(actual ?? "none")."
        }
    }
}

public protocol RemoteRuntimeHealthChecking: Sendable {
    func checkHealth(of endpoint: RemoteRuntimeEndpoint) async throws -> RemoteRuntimeHealth
}

public final class URLSessionRemoteRuntimeHealthChecker: RemoteRuntimeHealthChecking, @unchecked Sendable {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func checkHealth(of endpoint: RemoteRuntimeEndpoint) async throws -> RemoteRuntimeHealth {
        try validate(endpoint)
        var request = URLRequest(url: endpoint.healthURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        for (header, value) in endpoint.headers {
            request.setValue(value, forHTTPHeaderField: header)
        }

        let startedAt = Date()
        do {
            let (data, response) = try await session.data(for: request)
            let latency = Date().timeIntervalSince(startedAt) * 1_000
            guard let http = response as? HTTPURLResponse else {
                throw RemoteRuntimeHealthError.invalidResponse
            }
            guard (200..<300).contains(http.statusCode) else {
                return RemoteRuntimeHealth(
                    runtimeID: endpoint.id,
                    status: http.statusCode == 404 ? .unsupported : .offline,
                    message: "Health endpoint returned HTTP \(http.statusCode).",
                    latencyMilliseconds: latency
                )
            }
            let dto = try? JSONDecoder().decode(RuntimeHealthDTO.self, from: data)
            if let expected = endpoint.expectedServerID, dto?.serverID != expected {
                throw RemoteRuntimeHealthError.untrustedRuntime(expected: expected, actual: dto?.serverID)
            }
            return RemoteRuntimeHealth(
                runtimeID: endpoint.id,
                status: dto?.status.runtimeStatus ?? .online,
                message: dto?.message ?? "Runtime is reachable.",
                latencyMilliseconds: latency,
                version: dto?.version,
                capabilities: dto?.capabilities ?? []
            )
        } catch let error as RemoteRuntimeHealthError {
            throw error
        } catch {
            return RemoteRuntimeHealth(
                runtimeID: endpoint.id,
                status: .offline,
                message: error.localizedDescription
            )
        }
    }

    private func validate(_ endpoint: RemoteRuntimeEndpoint) throws {
        guard endpoint.healthURL.scheme == "https" || (endpoint.allowsInsecureLocalNetwork && isLocalNetwork(endpoint.healthURL)) else {
            throw RemoteRuntimeHealthError.insecureEndpoint(endpoint.healthURL)
        }
    }

    private func isLocalNetwork(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return host == "localhost"
            || host.hasSuffix(".local")
            || host.hasPrefix("127.")
            || host.hasPrefix("10.")
            || host.hasPrefix("192.168.")
            || (host.hasPrefix("172.") && (16...31).contains(Int(host.split(separator: ".").dropFirst().first ?? "") ?? -1))
    }
}

public actor InMemoryRemoteRuntimeHealthChecker: RemoteRuntimeHealthChecking {
    private var healthByRuntimeID: [RemoteRuntimeID: RemoteRuntimeHealth]

    public init(healthByRuntimeID: [RemoteRuntimeID: RemoteRuntimeHealth] = [:]) {
        self.healthByRuntimeID = healthByRuntimeID
    }

    public func setHealth(_ health: RemoteRuntimeHealth) {
        healthByRuntimeID[health.runtimeID] = health
    }

    public func checkHealth(of endpoint: RemoteRuntimeEndpoint) async throws -> RemoteRuntimeHealth {
        healthByRuntimeID[endpoint.id] ?? RemoteRuntimeHealth(
            runtimeID: endpoint.id,
            status: .offline,
            message: "No in-memory health registered."
        )
    }
}

private struct RuntimeHealthDTO: Decodable {
    struct Status: RawRepresentable, Decodable {
        var rawValue: String

        init(rawValue: String) {
            self.rawValue = rawValue
        }

        var runtimeStatus: RemoteRuntimeHealthStatus {
            switch rawValue {
            case "online":
                return .online
            case "degraded":
                return .degraded
            case "offline":
                return .offline
            case "untrusted":
                return .untrusted
            default:
                return .unsupported
            }
        }
    }

    var status: Status
    var message: String?
    var version: String?
    var serverID: String?
    var capabilities: [String]?

    enum CodingKeys: String, CodingKey {
        case status
        case message
        case version
        case serverID = "server_id"
        case capabilities
    }
}

