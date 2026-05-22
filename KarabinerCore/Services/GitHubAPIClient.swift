import Foundation

public enum GitHubHTTPMethod: String, Codable, Hashable, Sendable {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
}

public struct GitHubAPIRequest: Sendable {
    public struct QueryItem: Codable, Hashable, Sendable {
        public var name: String
        public var value: String?

        public init(name: String, value: String?) {
            self.name = name
            self.value = value
        }
    }

    public var method: GitHubHTTPMethod
    public var path: String
    public var queryItems: [QueryItem]
    public var headers: [String: String]
    public var body: Data?
    public var requiresAuthentication: Bool

    public init(
        method: GitHubHTTPMethod = .get,
        path: String,
        queryItems: [QueryItem] = [],
        headers: [String: String] = [:],
        body: Data? = nil,
        requiresAuthentication: Bool = true
    ) {
        self.method = method
        self.path = path
        self.queryItems = queryItems
        self.headers = headers
        self.body = body
        self.requiresAuthentication = requiresAuthentication
    }
}

public struct GitHubAPIResponse: Sendable {
    public var statusCode: Int
    public var headers: [String: String]
    public var body: Data

    public init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.statusCode = statusCode
        self.headers = headers
        self.body = body
    }

    public func decode<Value: Decodable>(_ type: Value.Type, decoder: JSONDecoder = JSONDecoder()) throws -> Value {
        do {
            return try decoder.decode(Value.self, from: body)
        } catch {
            throw GitHubAPIError.decodingFailed(error.localizedDescription)
        }
    }
}

public enum GitHubAPIError: Error, LocalizedError, Equatable, Sendable {
    case invalidBaseURL(URL)
    case invalidRequestPath(String)
    case missingToken
    case unauthorized
    case forbidden(String?)
    case notFound
    case rateLimited(retryAfter: Date?)
    case server(statusCode: Int, message: String?)
    case decodingFailed(String)
    case transportFailed(String)

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL(let url):
            "Invalid GitHub API base URL: \(url.absoluteString)"
        case .invalidRequestPath(let path):
            "Invalid GitHub API request path: \(path)"
        case .missingToken:
            "Missing GitHub user-to-server token."
        case .unauthorized:
            "GitHub authentication failed."
        case .forbidden(let message):
            message ?? "GitHub request was forbidden."
        case .notFound:
            "GitHub resource was not found."
        case .rateLimited(let retryAfter):
            if let retryAfter {
                "GitHub rate limit resets at \(retryAfter.formatted(.iso8601))."
            } else {
                "GitHub rate limit exceeded."
            }
        case .server(let statusCode, let message):
            "GitHub server returned \(statusCode): \(message ?? "no message")"
        case .decodingFailed(let message):
            "GitHub response decoding failed: \(message)"
        case .transportFailed(let message):
            "GitHub transport failed: \(message)"
        }
    }
}

public protocol GitHubAccessTokenProviding: Sendable {
    func accessToken() async throws -> String
}

public struct StoredGitHubAccessTokenProvider: GitHubAccessTokenProviding, Sendable {
    public var tokenStorage: any SecureTokenStorage
    public var tokenKey: TokenKey

    public init(tokenStorage: any SecureTokenStorage, tokenKey: TokenKey) {
        self.tokenStorage = tokenStorage
        self.tokenKey = tokenKey
    }

    public func accessToken() async throws -> String {
        let token = try await tokenStorage.token(for: tokenKey)
        guard !token.isExpired else {
            throw GitHubAPIError.unauthorized
        }
        return token.accessToken
    }
}

public protocol GitHubAPIClient: Sendable {
    func send(_ request: GitHubAPIRequest) async throws -> GitHubAPIResponse
}

public final class URLSessionGitHubAPIClient: GitHubAPIClient, @unchecked Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: (any GitHubAccessTokenProviding)?
    private let apiVersion: String

    public init(
        baseURL: URL = URL(string: "https://api.github.com")!,
        session: URLSession = .shared,
        tokenProvider: (any GitHubAccessTokenProviding)?,
        apiVersion: String = "2022-11-28"
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
        self.apiVersion = apiVersion
    }

    public func send(_ request: GitHubAPIRequest) async throws -> GitHubAPIResponse {
        var urlRequest = URLRequest(url: try url(for: request))
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.httpBody = request.body
        urlRequest.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        urlRequest.setValue(apiVersion, forHTTPHeaderField: "X-GitHub-Api-Version")
        if request.body != nil {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        for (header, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: header)
        }
        if request.requiresAuthentication {
            guard let tokenProvider else {
                throw GitHubAPIError.missingToken
            }
            let token = try await tokenProvider.accessToken()
            guard !token.isEmpty else {
                throw GitHubAPIError.missingToken
            }
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw GitHubAPIError.transportFailed("Response was not HTTP.")
            }
            let headers = httpResponse.allHeaderFields.reduce(into: [String: String]()) { result, pair in
                if let key = pair.key as? String {
                    result[key] = String(describing: pair.value)
                }
            }
            let githubResponse = GitHubAPIResponse(statusCode: httpResponse.statusCode, headers: headers, body: data)
            guard (200..<300).contains(httpResponse.statusCode) else {
                throw mapError(response: githubResponse)
            }
            return githubResponse
        } catch let error as GitHubAPIError {
            throw error
        } catch {
            throw GitHubAPIError.transportFailed(error.localizedDescription)
        }
    }

    private func url(for request: GitHubAPIRequest) throws -> URL {
        guard baseURL.scheme != nil, baseURL.host != nil else {
            throw GitHubAPIError.invalidBaseURL(baseURL)
        }
        guard request.path.hasPrefix("/") else {
            throw GitHubAPIError.invalidRequestPath(request.path)
        }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let basePath = components?.percentEncodedPath ?? ""
        let normalizedBasePath = basePath.hasSuffix("/") ? String(basePath.dropLast()) : basePath
        components?.percentEncodedPath = normalizedBasePath + request.path
        components?.queryItems = request.queryItems.map { URLQueryItem(name: $0.name, value: $0.value) }
        guard let url = components?.url else {
            throw GitHubAPIError.invalidRequestPath(request.path)
        }
        return url
    }

    private func mapError(response: GitHubAPIResponse) -> GitHubAPIError {
        let message = GitHubErrorMessage.decode(from: response.body)
        switch response.statusCode {
        case 401:
            return .unauthorized
        case 403:
            if response.headers["X-RateLimit-Remaining"] == "0" {
                return .rateLimited(retryAfter: retryAfter(from: response.headers["Retry-After"]))
            }
            return .forbidden(message)
        case 404:
            return .notFound
        case 429:
            return .rateLimited(retryAfter: retryAfter(from: response.headers["Retry-After"]))
        default:
            return .server(statusCode: response.statusCode, message: message)
        }
    }

    private func retryAfter(from header: String?) -> Date? {
        guard let header, let seconds = TimeInterval(header) else { return nil }
        return Date().addingTimeInterval(seconds)
    }
}

public actor InMemoryGitHubAPIClient: GitHubAPIClient {
    public typealias Handler = @Sendable (GitHubAPIRequest) async throws -> GitHubAPIResponse

    private struct Route: Hashable {
        var method: GitHubHTTPMethod
        var path: String
    }

    private var handlers: [Route: Handler] = [:]

    public init() {}

    public func register(method: GitHubHTTPMethod = .get, path: String, handler: @escaping Handler) {
        handlers[Route(method: method, path: path)] = handler
    }

    public func send(_ request: GitHubAPIRequest) async throws -> GitHubAPIResponse {
        guard let handler = handlers[Route(method: request.method, path: request.path)] else {
            throw GitHubAPIError.notFound
        }
        return try await handler(request)
    }
}

private struct GitHubErrorMessage: Decodable {
    var message: String?

    static func decode(from data: Data) -> String? {
        guard !data.isEmpty else { return nil }
        return try? JSONDecoder().decode(GitHubErrorMessage.self, from: data).message
    }
}
