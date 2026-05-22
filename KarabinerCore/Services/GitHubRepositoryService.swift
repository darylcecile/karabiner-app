import Foundation

public struct AuthenticatedGitHubSnapshot: Sendable, Hashable {
    public var connection: GitHubConnection
    public var repositories: [GitHubRepository]

    public init(connection: GitHubConnection, repositories: [GitHubRepository]) {
        self.connection = connection
        self.repositories = repositories
    }
}

public protocol GitHubRepositoryLoading: Sendable {
    func authenticatedSnapshot() async throws -> AuthenticatedGitHubSnapshot
}

public struct GitHubRepositoryService: GitHubRepositoryLoading, Sendable {
    private let apiClient: any GitHubAPIClient

    public init(apiClient: any GitHubAPIClient) {
        self.apiClient = apiClient
    }

    public func authenticatedSnapshot() async throws -> AuthenticatedGitHubSnapshot {
        let accountResponse = try await apiClient.send(.init(path: "/user"))
        let accountDTO = try accountResponse.decode(GitHubUserResponse.self, decoder: Self.defaultDecoder())
        let account = try accountDTO.account()
        let scopes = tokenScopes(from: accountResponse.headers)
        let connection = GitHubConnection(
            id: "github-\(account.id)",
            account: account,
            authState: .connected,
            tokenScopes: scopes,
            lastValidatedAt: Date()
        )
        return AuthenticatedGitHubSnapshot(connection: connection, repositories: try await repositories())
    }

    private func repositories() async throws -> [GitHubRepository] {
        var page = 1
        var repositories: [GitHubRepository] = []
        while true {
            let response = try await apiClient.send(
                .init(
                    path: "/user/repos",
                    queryItems: [
                        .init(name: "affiliation", value: "owner,collaborator,organization_member"),
                        .init(name: "sort", value: "pushed"),
                        .init(name: "direction", value: "desc"),
                        .init(name: "per_page", value: "100"),
                        .init(name: "page", value: "\(page)")
                    ]
                )
            )
            let pageRepositories = try response.decode([GitHubRepositoryResponse].self, decoder: Self.defaultDecoder())
            repositories.append(contentsOf: pageRepositories.map { $0.repository() })
            if pageRepositories.count < 100 {
                break
            }
            page += 1
        }
        return repositories
    }

    private func tokenScopes(from headers: [String: String]) -> Set<String> {
        guard let rawScopes = headers.first(where: { $0.key.caseInsensitiveCompare("X-OAuth-Scopes") == .orderedSame })?.value else {
            return []
        }
        return Set(
            rawScopes
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        )
    }

    private static func defaultDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private struct GitHubUserResponse: Decodable {
    var id: Int64
    var login: String
    var name: String?
    var type: String
    var avatarUrl: URL?
    var htmlUrl: URL?

    func account() throws -> GitHubAccount {
        let kind: GitHubAccount.AccountKind
        switch type {
        case "User":
            kind = .user
        case "Organization":
            kind = .organization
        case "Bot":
            kind = .bot
        default:
            throw GitHubAPIError.decodingFailed("Unsupported GitHub account type: \(type)")
        }
        return GitHubAccount(
            id: id,
            login: login,
            displayName: name,
            kind: kind,
            avatarURL: avatarUrl,
            profileURL: htmlUrl
        )
    }
}

private struct GitHubRepositoryResponse: Decodable {
    struct Owner: Decodable {
        var login: String
    }

    struct Permissions: Decodable {
        var admin: Bool?
        var push: Bool?
        var pull: Bool?
        var maintain: Bool?
        var triage: Bool?
    }

    var id: Int64
    var owner: Owner
    var name: String
    var visibility: GitHubRepository.Visibility
    var defaultBranch: String
    var htmlUrl: URL
    var cloneUrl: URL?
    var permissions: Permissions?
    var archived: Bool
    var fork: Bool

    func repository() -> GitHubRepository {
        let hasRead = permissions?.pull ?? true
        let hasWrite = permissions?.push ?? permissions?.maintain ?? permissions?.admin ?? false
        let hasAdmin = permissions?.admin ?? false
        return GitHubRepository(
            id: id,
            ownerLogin: owner.login,
            name: name,
            visibility: visibility,
            defaultBranch: defaultBranch,
            htmlURL: htmlUrl,
            cloneURL: cloneUrl,
            permissions: .init(
                canRead: hasRead,
                canWrite: hasWrite,
                canAdmin: hasAdmin,
                canCreatePullRequest: hasRead,
                canMergePullRequest: hasWrite || hasAdmin
            ),
            isArchived: archived,
            isFork: fork
        )
    }
}
