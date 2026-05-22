import Foundation
import KarabinerCore
import Testing
@testable import KarabinerUI

@MainActor
struct RealDataIntegrationTests {
    @Test("Connecting GitHub stores the token and loads repositories instead of fixture data")
    func githubConnectionLoadsRealStateThroughInjectedLoader() async throws {
        let tokenStore = InMemoryTokenStore()
        let repository = GitHubRepository(
            id: 42,
            ownerLogin: "octocat",
            name: "Hello-World",
            visibility: .public,
            defaultBranch: "main",
            htmlURL: try #require(URLComponents(string: "https://github.com/octocat/Hello-World")?.url),
            permissions: .init(
                canRead: true,
                canWrite: false,
                canAdmin: false,
                canCreatePullRequest: true,
                canMergePullRequest: false
            )
        )
        let account = GitHubAccount(
            id: 1,
            login: "octocat",
            displayName: "Mona Octocat",
            kind: .user,
            profileURL: URL(string: "https://github.com/octocat")
        )
        let snapshot = AuthenticatedGitHubSnapshot(
            connection: GitHubConnection(
                id: "github-1",
                account: account,
                authState: .connected,
                tokenScopes: ["metadata"]
            ),
            repositories: [repository]
        )
        let store = KarabinerAppStore(tokenStorage: tokenStore) { _ in
            StubGitHubRepositoryLoader(snapshot: snapshot)
        }

        await store.connectGitHub(accessToken: " github-token ")

        let storedToken = try await tokenStore.token(for: KarabinerAppStore.githubTokenKey)
        #expect(storedToken.accessToken == "github-token")
        #expect(store.githubConnection?.account.login == "octocat")
        #expect(store.repositories == [repository])
        #expect(store.phase == .loaded)
        #expect(store.canDisconnectGitHub)
        #expect(store.hasGitHubCredential)
    }

    @Test("Invalid GitHub credentials can be disconnected and removed from storage")
    func failedGitHubConnectionStillAllowsDisconnectingStoredCredential() async throws {
        let tokenStore = InMemoryTokenStore()
        let store = KarabinerAppStore(tokenStorage: tokenStore) { _ in
            ThrowingGitHubRepositoryLoader(error: GitHubAPIError.unauthorized)
        }

        await store.connectGitHub(accessToken: "bad-token")

        let storedToken = try await tokenStore.token(for: KarabinerAppStore.githubTokenKey)
        #expect(storedToken.accessToken == "bad-token")
        #expect(store.githubConnection == nil)
        #expect(store.phase == .failed("GitHub authentication failed."))
        #expect(store.canDisconnectGitHub)
        #expect(store.hasGitHubCredential)

        await store.disconnectGitHub()

        #expect(store.canDisconnectGitHub == false)
        #expect(store.hasGitHubCredential == false)
        #expect(store.phase == .disconnected)
        do {
            _ = try await tokenStore.token(for: KarabinerAppStore.githubTokenKey)
            Issue.record("Expected disconnecting GitHub to remove an invalid stored token.")
        } catch SecureTokenStorageError.notFound(let missingKey) {
            #expect(missingKey == KarabinerAppStore.githubTokenKey)
        } catch {
            Issue.record("Expected notFound after disconnecting, got \(error).")
        }
    }

    @Test("GitHub repository service maps REST responses into app models")
    func githubRepositoryServiceMapsAuthenticatedResponses() async throws {
        let client = InMemoryGitHubAPIClient()
        await client.register(path: "/user") { _ in
            GitHubAPIResponse(
                statusCode: 200,
                headers: ["X-OAuth-Scopes": "metadata, repo"],
                body: Data(
                    """
                    {
                      "id": 1,
                      "login": "octocat",
                      "name": "Mona Octocat",
                      "type": "User",
                      "avatar_url": "https://avatars.githubusercontent.com/u/1",
                      "html_url": "https://github.com/octocat"
                    }
                    """.utf8
                )
            )
        }
        await client.register(path: "/user/repos") { _ in
            GitHubAPIResponse(
                statusCode: 200,
                body: Data(
                    """
                    [
                      {
                        "id": 42,
                        "owner": { "login": "octocat" },
                        "name": "Hello-World",
                        "visibility": "public",
                        "default_branch": "main",
                        "html_url": "https://github.com/octocat/Hello-World",
                        "clone_url": "https://github.com/octocat/Hello-World.git",
                        "permissions": { "admin": false, "push": true, "pull": true },
                        "archived": false,
                        "fork": false
                      }
                    ]
                    """.utf8
                )
            )
        }

        let snapshot = try await GitHubRepositoryService(apiClient: client).authenticatedSnapshot()

        #expect(snapshot.connection.account.login == "octocat")
        #expect(snapshot.connection.tokenScopes == ["metadata", "repo"])
        #expect(snapshot.repositories.map(\.fullName) == ["octocat/Hello-World"])
        #expect(snapshot.repositories.first?.permissions.canWrite == true)
    }
}

private struct StubGitHubRepositoryLoader: GitHubRepositoryLoading {
    var snapshot: AuthenticatedGitHubSnapshot

    func authenticatedSnapshot() async throws -> AuthenticatedGitHubSnapshot {
        snapshot
    }
}

private struct ThrowingGitHubRepositoryLoader: GitHubRepositoryLoading {
    var error: Error

    func authenticatedSnapshot() async throws -> AuthenticatedGitHubSnapshot {
        throw error
    }
}
