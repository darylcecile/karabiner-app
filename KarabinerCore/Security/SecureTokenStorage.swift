import Foundation
import Security

public struct TokenKey: Codable, Hashable, Sendable {
    public var namespace: String
    public var accountID: String

    public init(namespace: String, accountID: String) {
        self.namespace = namespace
        self.accountID = accountID
    }

    public var keychainAccount: String {
        "\(namespace):\(accountID)"
    }
}

public struct StoredToken: Codable, Hashable, Sendable, CustomStringConvertible {
    public var accessToken: String
    public var refreshToken: String?
    public var tokenType: String
    public var scopes: [String]
    public var expiresAt: Date?
    public var receivedAt: Date

    public init(
        accessToken: String,
        refreshToken: String? = nil,
        tokenType: String = "Bearer",
        scopes: [String] = [],
        expiresAt: Date? = nil,
        receivedAt: Date = Date()
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.tokenType = tokenType
        self.scopes = scopes
        self.expiresAt = expiresAt
        self.receivedAt = receivedAt
    }

    public var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt <= Date()
    }

    public var description: String {
        "StoredToken(tokenType: \(tokenType), scopes: \(scopes), expiresAt: \(String(describing: expiresAt)), accessToken: <redacted>, refreshToken: \(refreshToken == nil ? "nil" : "<redacted>"))"
    }
}

public enum SecureTokenStorageError: Error, LocalizedError, Equatable, Sendable {
    case notFound(TokenKey)
    case keychainFailure(operation: String, status: OSStatus)
    case encodingFailed(String)
    case decodingFailed(String)

    public var errorDescription: String? {
        switch self {
        case .notFound(let key):
            "No token found for \(key.namespace)."
        case .keychainFailure(let operation, let status):
            "Keychain \(operation) failed with status \(status)."
        case .encodingFailed(let message):
            "Token encoding failed: \(message)"
        case .decodingFailed(let message):
            "Token decoding failed: \(message)"
        }
    }
}

public protocol SecureTokenStorage: Sendable {
    func store(_ token: StoredToken, for key: TokenKey) async throws
    func token(for key: TokenKey) async throws -> StoredToken
    func deleteToken(for key: TokenKey) async throws
}

public actor InMemoryTokenStore: SecureTokenStorage {
    private var tokens: [TokenKey: StoredToken] = [:]

    public init(tokens: [TokenKey: StoredToken] = [:]) {
        self.tokens = tokens
    }

    public func store(_ token: StoredToken, for key: TokenKey) async throws {
        tokens[key] = token
    }

    public func token(for key: TokenKey) async throws -> StoredToken {
        guard let token = tokens[key] else {
            throw SecureTokenStorageError.notFound(key)
        }
        return token
    }

    public func deleteToken(for key: TokenKey) async throws {
        tokens.removeValue(forKey: key)
    }
}

public final class KeychainTokenStore: SecureTokenStorage, @unchecked Sendable {
    private let service: String
    private let accessGroup: String?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(service: String = "Karabiner", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    public func store(_ token: StoredToken, for key: TokenKey) async throws {
        let data: Data
        do {
            data = try encoder.encode(token)
        } catch {
            throw SecureTokenStorageError.encodingFailed(error.localizedDescription)
        }

        var query = baseQuery(for: key)
        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SecureTokenStorageError.keychainFailure(operation: "add", status: status)
        }
    }

    public func token(for key: TokenKey) async throws -> StoredToken {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status != errSecItemNotFound else {
            throw SecureTokenStorageError.notFound(key)
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw SecureTokenStorageError.keychainFailure(operation: "copy", status: status)
        }

        do {
            return try decoder.decode(StoredToken.self, from: data)
        } catch {
            throw SecureTokenStorageError.decodingFailed(error.localizedDescription)
        }
    }

    public func deleteToken(for key: TokenKey) async throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SecureTokenStorageError.keychainFailure(operation: "delete", status: status)
        }
    }

    private func baseQuery(for key: TokenKey) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.keychainAccount
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }
}

