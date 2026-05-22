import Foundation
import KarabinerCore
import Testing

struct OAuthSecurityTests {
    @Test("PKCE verifier and challenge use URL-safe S256 shape")
    func pkceVerifierAndChallengeUseURLSafeShape() throws {
        let verifier = try PKCEGenerator.codeVerifier()
        let challenge = PKCEGenerator.codeChallenge(for: verifier)
        let allowedCharacters = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        let verifierIsURLSafe = verifier.unicodeScalars.allSatisfy { allowedCharacters.contains($0) }
        let challengeIsURLSafe = challenge.unicodeScalars.allSatisfy { allowedCharacters.contains($0) }

        #expect((43...128).contains(verifier.count))
        #expect(verifierIsURLSafe)
        #expect(challenge.count == 43)
        #expect(challengeIsURLSafe)
        #expect(challenge.contains("=") == false)
        #expect(challenge.contains("+") == false)
        #expect(challenge.contains("/") == false)
        #expect(challenge != verifier)
    }

    @Test("PKCE challenge matches the RFC 7636 S256 example")
    func pkceChallengeMatchesKnownRFCExample() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge = PKCEGenerator.codeChallenge(for: verifier)

        #expect(challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test("PKCE generator rejects verifiers outside the allowed length range")
    func pkceVerifierRejectsInvalidLength() {
        do {
            _ = try PKCEGenerator.codeVerifier(byteCount: 16)
            Issue.record("Expected an invalid verifier length error for short random input.")
        } catch OAuthPKCEError.invalidVerifierLength(let length) {
            #expect(length < 43)
        } catch {
            Issue.record("Expected invalidVerifierLength, got \(error).")
        }
    }

    @Test("In-memory PKCE state store consumes states exactly once and expires stale state")
    func pkceStateStoreIsSingleUseAndExpiryAware() async throws {
        let store = InMemoryOAuthPKCEStateStore()
        let state = try await store.createState(lifetime: 600)

        #expect(state.codeChallengeMethod == "S256")
        #expect(state.expiresAt > state.createdAt)

        let consumed = try await store.consumeState(state.state)
        #expect(consumed == state)

        await expectPKCEError(.stateNotFound) {
            _ = try await store.consumeState(state.state)
        }

        let expired = try await store.createState(lifetime: -1)
        await expectPKCEError(.stateExpired) {
            _ = try await store.consumeState(expired.state)
        }
    }

    @Test("GitHub OAuth request builder includes PKCE, state, scopes, and callback metadata")
    func githubOAuthBuilderProducesPKCEAuthorizationURL() async throws {
        let store = InMemoryOAuthPKCEStateStore()
        let builder = GitHubOAuthPKCEAuthorizationBuilder(
            clientID: "client-id",
            redirectURI: URL(string: "karabiner://oauth/callback")!,
            callbackURLScheme: "karabiner",
            scopes: ["repo", "read:user"],
            stateStore: store,
            authorizationEndpoint: URL(string: "https://github.example/login/oauth/authorize")!
        )

        let request = try await builder.authorizationRequest()
        let components = try #require(URLComponents(url: request.url, resolvingAgainstBaseURL: false))
        let queryItems = try #require(components.queryItems)
        let query = Dictionary(uniqueKeysWithValues: queryItems.map { ($0.name, $0.value ?? "") })

        #expect(request.callbackURLScheme == "karabiner")
        #expect(components.host == "github.example")
        #expect(query["client_id"] == "client-id")
        #expect(query["redirect_uri"] == "karabiner://oauth/callback")
        #expect(query["scope"] == "repo read:user")
        #expect(query["state"] == request.state.state)
        #expect(query["code_challenge"] == request.state.codeChallenge)
        #expect(query["code_challenge_method"] == "S256")
        #expect(query["allow_signup"] == "true")
    }
}

struct SecureTokenStorageTests {
    @Test("In-memory token storage stores, replaces, retrieves, and deletes tokens without persistence")
    func inMemoryTokenStoreSupportsEphemeralTokenLifecycle() async throws {
        let key = TokenKey(namespace: "github", accountID: "octocat")
        let store = InMemoryTokenStore()
        let first = StoredToken(
            accessToken: "ghp_first_secret",
            refreshToken: "refresh_first_secret",
            scopes: ["repo"],
            expiresAt: Date(timeIntervalSinceNow: 3_600),
            receivedAt: KarabinerTestFixtures.fixedDate
        )
        let replacement = StoredToken(
            accessToken: "ghp_replacement_secret",
            refreshToken: nil,
            scopes: ["repo", "read:user"],
            expiresAt: Date(timeIntervalSinceNow: 7_200),
            receivedAt: KarabinerTestFixtures.fixedDate
        )

        try await store.store(first, for: key)
        try await store.store(replacement, for: key)
        let retrieved = try await store.token(for: key)
        try await store.deleteToken(for: key)

        #expect(retrieved == replacement)
        #expect(retrieved.isExpired == false)
        #expect(String(describing: retrieved).contains("ghp_replacement_secret") == false)
        #expect(String(describing: retrieved).contains("<redacted>"))

        do {
            _ = try await store.token(for: key)
            Issue.record("Expected deleted in-memory tokens to be unavailable.")
        } catch SecureTokenStorageError.notFound(let missingKey) {
            #expect(missingKey == key)
        } catch {
            Issue.record("Expected notFound after deletion, got \(error).")
        }
    }

    @Test("Stored token expiry is derived from the expiry timestamp")
    func storedTokenExpiryReflectsTimestamp() {
        let expired = StoredToken(
            accessToken: "expired",
            expiresAt: Date(timeIntervalSinceNow: -60),
            receivedAt: KarabinerTestFixtures.fixedDate
        )
        let nonExpiring = StoredToken(
            accessToken: "non-expiring",
            expiresAt: nil,
            receivedAt: KarabinerTestFixtures.fixedDate
        )

        #expect(expired.isExpired)
        #expect(nonExpiring.isExpired == false)
    }
}

private func expectPKCEError(
    _ expected: OAuthPKCEError,
    operation: () async throws -> Void
) async {
    do {
        try await operation()
        Issue.record("Expected \(expected), but no error was thrown.")
    } catch let error as OAuthPKCEError {
        #expect(error == expected)
    } catch {
        Issue.record("Expected \(expected), got \(error).")
    }
}
