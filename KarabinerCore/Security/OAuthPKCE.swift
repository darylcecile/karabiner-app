import AuthenticationServices
import CryptoKit
import Foundation
import Security

public struct OAuthPKCEState: Codable, Hashable, Sendable {
    public var state: String
    public var nonce: String
    public var codeVerifier: String
    public var codeChallenge: String
    public var codeChallengeMethod: String
    public var createdAt: Date
    public var expiresAt: Date

    public init(
        state: String,
        nonce: String,
        codeVerifier: String,
        codeChallenge: String,
        codeChallengeMethod: String = "S256",
        createdAt: Date = Date(),
        expiresAt: Date
    ) {
        self.state = state
        self.nonce = nonce
        self.codeVerifier = codeVerifier
        self.codeChallenge = codeChallenge
        self.codeChallengeMethod = codeChallengeMethod
        self.createdAt = createdAt
        self.expiresAt = expiresAt
    }
}

public enum OAuthPKCEError: Error, LocalizedError, Equatable, Sendable {
    case secureRandomFailed(OSStatus)
    case invalidVerifierLength(Int)
    case stateNotFound
    case stateExpired
    case invalidAuthorizationCallback

    public var errorDescription: String? {
        switch self {
        case .secureRandomFailed(let status):
            "Secure random generation failed with status \(status)."
        case .invalidVerifierLength(let length):
            "Generated PKCE verifier has invalid length \(length)."
        case .stateNotFound:
            "OAuth state was not found or already consumed."
        case .stateExpired:
            "OAuth state has expired."
        case .invalidAuthorizationCallback:
            "OAuth callback did not include the expected authorization code and state."
        }
    }
}

public protocol OAuthPKCEStateManaging: Sendable {
    func createState(lifetime: TimeInterval) async throws -> OAuthPKCEState
    func consumeState(_ state: String) async throws -> OAuthPKCEState
    func discardExpiredStates(now: Date) async
}

public actor InMemoryOAuthPKCEStateStore: OAuthPKCEStateManaging {
    private var states: [String: OAuthPKCEState] = [:]

    public init() {}

    public func createState(lifetime: TimeInterval = 600) async throws -> OAuthPKCEState {
        let verifier = try PKCEGenerator.codeVerifier()
        let now = Date()
        let pkce = OAuthPKCEState(
            state: try PKCEGenerator.randomURLSafeString(byteCount: 32),
            nonce: try PKCEGenerator.randomURLSafeString(byteCount: 32),
            codeVerifier: verifier,
            codeChallenge: PKCEGenerator.codeChallenge(for: verifier),
            createdAt: now,
            expiresAt: now.addingTimeInterval(lifetime)
        )
        states[pkce.state] = pkce
        return pkce
    }

    public func consumeState(_ state: String) async throws -> OAuthPKCEState {
        guard let pkce = states.removeValue(forKey: state) else {
            throw OAuthPKCEError.stateNotFound
        }
        guard pkce.expiresAt > Date() else {
            throw OAuthPKCEError.stateExpired
        }
        return pkce
    }

    public func discardExpiredStates(now: Date = Date()) async {
        states = states.filter { $0.value.expiresAt > now }
    }
}

public enum PKCEGenerator {
    public static func codeVerifier(byteCount: Int = 32) throws -> String {
        let verifier = try randomURLSafeString(byteCount: byteCount)
        guard (43...128).contains(verifier.count) else {
            throw OAuthPKCEError.invalidVerifierLength(verifier.count)
        }
        return verifier
    }

    public static func codeChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedStringWithoutPadding()
    }

    public static func randomURLSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, byteCount, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw OAuthPKCEError.secureRandomFailed(status)
        }
        return Data(bytes).base64URLEncodedStringWithoutPadding()
    }
}

public struct OAuthAuthorizationRequest: Sendable {
    public var url: URL
    public var state: OAuthPKCEState
    public var callbackURLScheme: String

    public init(url: URL, state: OAuthPKCEState, callbackURLScheme: String) {
        self.url = url
        self.state = state
        self.callbackURLScheme = callbackURLScheme
    }
}

public protocol OAuthAuthorizationRequestBuilding: Sendable {
    func authorizationRequest() async throws -> OAuthAuthorizationRequest
}

public struct GitHubOAuthPKCEAuthorizationBuilder: OAuthAuthorizationRequestBuilding, Sendable {
    public var clientID: String
    public var redirectURI: URL
    public var callbackURLScheme: String
    public var scopes: [String]
    public var stateStore: any OAuthPKCEStateManaging
    public var authorizationEndpoint: URL

    public init(
        clientID: String,
        redirectURI: URL,
        callbackURLScheme: String,
        scopes: [String],
        stateStore: any OAuthPKCEStateManaging,
        authorizationEndpoint: URL = URL(string: "https://github.com/login/oauth/authorize")!
    ) {
        self.clientID = clientID
        self.redirectURI = redirectURI
        self.callbackURLScheme = callbackURLScheme
        self.scopes = scopes
        self.stateStore = stateStore
        self.authorizationEndpoint = authorizationEndpoint
    }

    public func authorizationRequest() async throws -> OAuthAuthorizationRequest {
        let pkce = try await stateStore.createState(lifetime: 600)
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI.absoluteString),
            URLQueryItem(name: "scope", value: scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: pkce.state),
            URLQueryItem(name: "code_challenge", value: pkce.codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: pkce.codeChallengeMethod),
            URLQueryItem(name: "allow_signup", value: "true")
        ]
        guard let url = components?.url else {
            throw ServiceFailure.invalidConfiguration("OAuth authorization URL could not be constructed.")
        }
        return OAuthAuthorizationRequest(url: url, state: pkce, callbackURLScheme: callbackURLScheme)
    }
}

public protocol OAuthWebAuthenticating: Sendable {
    @MainActor
    func authenticate(with request: OAuthAuthorizationRequest) async throws -> URL
}

@MainActor
public protocol OAuthPresentationAnchorProviding: AnyObject {
    func presentationAnchor() -> ASPresentationAnchor
}

@MainActor
public final class AuthenticationServicesOAuthSession: NSObject, OAuthWebAuthenticating, ASWebAuthenticationPresentationContextProviding {
    private let anchorProvider: any OAuthPresentationAnchorProviding
    private var currentSession: ASWebAuthenticationSession?

    public init(anchorProvider: any OAuthPresentationAnchorProviding) {
        self.anchorProvider = anchorProvider
    }

    public func authenticate(with request: OAuthAuthorizationRequest) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: request.url,
                callbackURLScheme: request.callbackURLScheme
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(throwing: OAuthPKCEError.invalidAuthorizationCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            currentSession = session
            if !session.start() {
                currentSession = nil
                continuation.resume(throwing: ServiceFailure.unavailable("AuthenticationServices could not start a web authentication session."))
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchorProvider.presentationAnchor()
    }
}

private extension Data {
    func base64URLEncodedStringWithoutPadding() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
