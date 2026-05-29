import type { Env, AuthenticatedUser } from "../types";

const accessTokenTtlSeconds = 60 * 60;
const refreshTokenTtlSeconds = 60 * 60 * 24 * 30;
const minimumTokenPepperLength = 32;

interface SessionRow {
  session_id: string;
  user_id: string;
  handle: string;
  display_name: string;
}

export interface SessionPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export class SessionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionConfigurationError";
  }
}

export async function createSessionPair(
  env: Env,
  userId: string,
  userAgent: string | null
): Promise<SessionPair> {
  const accessToken = createOpaqueToken();
  const refreshToken = createOpaqueToken();
  const accessTokenExpiresAt = dateAfter(accessTokenTtlSeconds);
  const refreshTokenExpiresAt = dateAfter(refreshTokenTtlSeconds);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, kind, user_agent, expires_at) VALUES (?, ?, ?, 'access', ?, ?)"
    ).bind(
      crypto.randomUUID(),
      userId,
      await hashToken(accessToken, env),
      userAgent,
      toSqliteDateTime(accessTokenExpiresAt)
    ),
    env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, kind, user_agent, expires_at) VALUES (?, ?, ?, 'refresh', ?, ?)"
    ).bind(
      crypto.randomUUID(),
      userId,
      await hashToken(refreshToken, env),
      userAgent,
      toSqliteDateTime(refreshTokenExpiresAt)
    )
  ]);

  return {
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString()
  };
}

export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const row = await env.DB.prepare(
    `SELECT
      sessions.id AS session_id,
      users.id AS user_id,
      users.handle AS handle,
      users.display_name AS display_name
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.kind = 'access'
      AND sessions.revoked_at IS NULL
      AND unixepoch(sessions.expires_at) > unixepoch('now')
      AND users.status = 'active'
    LIMIT 1`
  )
    .bind(await hashToken(token, env))
    .first<SessionRow>();

  if (!row) {
    return null;
  }

  return {
    id: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    sessionId: row.session_id
  };
}

export async function refreshAccessToken(
  env: Env,
  refreshToken: string,
  userAgent: string | null
): Promise<SessionPair | null> {
  const row = await env.DB.prepare(
    `SELECT users.id AS user_id
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.kind = 'refresh'
      AND sessions.revoked_at IS NULL
      AND unixepoch(sessions.expires_at) > unixepoch('now')
      AND users.status = 'active'
    LIMIT 1`
  )
    .bind(await hashToken(refreshToken, env))
    .first<{ user_id: string }>();

  if (!row) {
    return null;
  }

  await revokeToken(env, refreshToken);
  return createSessionPair(env, row.user_id, userAgent);
}

export async function revokeToken(env: Env, token: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?")
    .bind(await hashToken(token, env))
    .run();
}

function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function hashToken(token: string, env: Env): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${token}.${tokenPepper(env)}`)
  );

  return encodeBase64Url(new Uint8Array(digest));
}

function tokenPepper(env: Env): string {
  const pepper = env.TOKEN_PEPPER;

  if (typeof pepper !== "string" || pepper.trim().length < minimumTokenPepperLength) {
    throw new SessionConfigurationError("TOKEN_PEPPER must be set to at least 32 characters.");
  }

  return pepper;
}

function dateAfter(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function toSqliteDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
