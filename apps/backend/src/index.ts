import {
  createEnvelopeId,
  isMessageBlock,
  isRecord,
  type MessageBlock,
  type PluginDispatchEvent
} from "@karabiner/shared";
import { verifyAppleIdentityToken } from "./auth/apple";
import {
  authenticateRequest,
  createSessionPair,
  refreshAccessToken,
  revokeToken,
  SessionConfigurationError
} from "./auth/session";
import { ChatRoom } from "./durable-objects/ChatRoom";
import { errorResponse, jsonResponse, optionsResponse } from "./http/responses";
import { JsonRequestError, readJsonObject } from "./http/json";
import { createMediaKey } from "./storage/media";
import { handlePluginDispatchQueue } from "./queues/pluginDispatch";
import type { Env } from "./types";

export { ChatRoom };

const maxMediaBytes = 10 * 1024 * 1024;
const sha256HexPattern = /^[a-f0-9]{64}$/;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return respondWithErrors(request, env, () => handleRequest(request, env, ctx));
  },

  async queue(batch, env): Promise<void> {
    await handlePluginDispatchQueue(batch, env);
  }
} satisfies ExportedHandler<Env, PluginDispatchEvent>;

async function respondWithErrors(
  request: Request,
  env: Env,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return errorResponse(request, env, error.status, error.code, error.message);
    }

    if (error instanceof SessionConfigurationError) {
      console.error(error.message);
      return errorResponse(
        request,
        env,
        500,
        "session_configuration_error",
        "Backend session configuration is incomplete."
      );
    }

    console.error("Unhandled backend error", error);
    return errorResponse(request, env, 500, "internal_error", "An unexpected backend error occurred.");
  }
}

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return optionsResponse(request, env);
  }

  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return jsonResponse(request, env, { ok: true, service: "karabiner-backend" });
  }

  if (url.pathname === "/auth/apple" && request.method === "POST") {
    return handleAppleAuth(request, env);
  }

  if (url.pathname === "/auth/refresh" && request.method === "POST") {
    return handleRefresh(request, env);
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    return handleLogout(request, env);
  }

  const auth = await authenticateRequest(request, env);

  if (!auth) {
    return errorResponse(request, env, 401, "unauthorized", "Authentication is required.");
  }

  if (url.pathname === "/me" && request.method === "GET") {
    return jsonResponse(request, env, {
      user: {
        id: auth.id,
        handle: auth.handle,
        displayName: auth.displayName
      }
    });
  }

  if (url.pathname === "/conversations" && request.method === "GET") {
    return handleListConversations(request, env, auth.id);
  }

  if (url.pathname.match(/^\/conversations\/[^/]+\/messages$/) && request.method === "POST") {
    return handleCreateMessage(request, env, auth.id, ctx);
  }

  if (url.pathname === "/media/upload-intents" && request.method === "POST") {
    return handleCreateMediaIntent(request, env, auth.id);
  }

  if (url.pathname.match(/^\/media\/objects\/[^/]+$/) && request.method === "PUT") {
    return handleUploadMediaObject(request, env, auth.id);
  }

  if (url.pathname.match(/^\/rooms\/[^/]+\/websocket$/) && request.method === "GET") {
    return handleRoomSocket(request, env, auth.id, auth.sessionId);
  }

  return errorResponse(request, env, 404, "not_found", "No route matched this request.");
}

async function handleAppleAuth(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const identityToken = typeof body.identityToken === "string" ? body.identityToken : null;

  if (!identityToken) {
    return errorResponse(request, env, 400, "identity_token_required", "Apple identity token is required.");
  }

  let claims: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;

  try {
    claims = await verifyAppleIdentityToken(identityToken, env);
  } catch {
    return errorResponse(request, env, 401, "invalid_identity_token", "Apple identity token is invalid.");
  }

  const requestedHandle = typeof body.handle === "string" ? normalizeHandle(body.handle) : null;
  const handle = requestedHandle ?? `apple-${claims.sub.slice(0, 8).toLowerCase()}`;
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim().length > 0
      ? body.displayName.trim()
      : handle;

  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, apple_sub, handle, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(apple_sub) DO UPDATE SET updated_at = datetime('now')
    RETURNING id`
  )
    .bind(userId, claims.sub, handle, displayName)
    .first<{ id: string }>();

  const user = await env.DB.prepare(
    "SELECT id, handle, display_name FROM users WHERE apple_sub = ? LIMIT 1"
  )
    .bind(claims.sub)
    .first<{ id: string; handle: string; display_name: string }>();

  if (!user) {
    return errorResponse(request, env, 500, "user_upsert_failed", "Unable to create or load user.");
  }

  const tokens = await createSessionPair(env, user.id, request.headers.get("User-Agent"));

  return jsonResponse(request, env, {
    user: { id: user.id, handle: user.handle, displayName: user.display_name },
    tokens
  });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : null;

  if (!refreshToken) {
    return errorResponse(request, env, 400, "refresh_token_required", "Refresh token is required.");
  }

  const tokens = await refreshAccessToken(env, refreshToken, request.headers.get("User-Agent"));

  if (!tokens) {
    return errorResponse(request, env, 401, "invalid_refresh_token", "Refresh token is invalid.");
  }

  return jsonResponse(request, env, { tokens });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const token = typeof body.token === "string" ? body.token : null;

  if (!token) {
    return errorResponse(request, env, 400, "token_required", "Token is required.");
  }

  await revokeToken(env, token);
  return jsonResponse(request, env, { ok: true });
}

async function handleListConversations(request: Request, env: Env, userId: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT
      conversations.id,
      conversations.kind,
      conversations.title,
      conversations.visibility,
      conversations.created_at AS createdAt,
      conversations.updated_at AS updatedAt,
      0 AS threadCount,
      0 AS unreadCount
    FROM conversations
    INNER JOIN conversation_members ON conversation_members.conversation_id = conversations.id
    WHERE conversation_members.user_id = ?
      AND conversation_members.state = 'active'
    ORDER BY conversations.updated_at DESC`
  )
    .bind(userId)
    .all();

  return jsonResponse(request, env, { conversations: results });
}

async function handleCreateMessage(
  request: Request,
  env: Env,
  userId: string,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const conversationId = url.pathname.split("/")[2];

  if (!conversationId) {
    return errorResponse(request, env, 400, "conversation_required", "Conversation ID is required.");
  }

  const body = await readJsonObject(request);

  if (!Array.isArray(body.blocks) || !body.blocks.every(isMessageBlock)) {
    return errorResponse(request, env, 400, "invalid_blocks", "Message blocks must be an array.");
  }

  if (!(await isActiveConversationMember(env, conversationId, userId))) {
    return errorResponse(request, env, 403, "not_a_member", "You are not a member of this conversation.");
  }

  const message = {
    id: crypto.randomUUID(),
    conversationId,
    senderId: userId,
    parentMessageId: typeof body.parentMessageId === "string" ? body.parentMessageId : undefined,
    blocks: body.blocks,
    createdAt: new Date().toISOString()
  };

  await env.DB.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, parent_message_id, blocks_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      message.id,
      conversationId,
      userId,
      message.parentMessageId ?? null,
      JSON.stringify(message.blocks),
      message.createdAt
    )
    .run();

  ctx.waitUntil(
    env.PLUGIN_DISPATCH.send({
      id: createEnvelopeId("plugin"),
      pluginId: "system-message-created",
      conversationId,
      actorUserId: userId,
      type: "message_created",
      payload: { messageId: message.id },
      createdAt: message.createdAt
    })
  );

  return jsonResponse(request, env, { message }, { status: 201 });
}

async function handleCreateMediaIntent(request: Request, env: Env, userId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const fileName = typeof body.fileName === "string" ? body.fileName : null;
  const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : null;
  const mimeType = normalizeMimeType(body.mimeType);
  const byteSize = typeof body.byteSize === "number" ? body.byteSize : null;

  if (
    !fileName ||
    fileName.length > 255 ||
    !sha256 ||
    !sha256HexPattern.test(sha256) ||
    !mimeType ||
    byteSize === null ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 ||
    byteSize > maxMediaBytes
  ) {
    return errorResponse(request, env, 400, "invalid_media", "Valid media metadata is required.");
  }

  const mediaId = crypto.randomUUID();
  const key = createMediaKey(userId, sha256, fileName);
  const existingMedia = await env.DB.prepare(
    `SELECT id, r2_key, mime_type, byte_size
    FROM media_objects
    WHERE owner_user_id = ? AND r2_key = ? AND deleted_at IS NULL
    LIMIT 1`
  )
    .bind(userId, key)
    .first<{ id: string; r2_key: string; mime_type: string; byte_size: number }>();

  if (existingMedia) {
    if (existingMedia.mime_type !== mimeType || existingMedia.byte_size !== byteSize) {
      return errorResponse(
        request,
        env,
        409,
        "media_conflict",
        "Media intent metadata conflicts with an existing object."
      );
    }

    return mediaIntentResponse(request, env, existingMedia.id, existingMedia.r2_key, 200);
  }

  await env.DB.prepare(
    `INSERT INTO media_objects (id, owner_user_id, r2_key, sha256, mime_type, byte_size)
    VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(mediaId, userId, key, sha256, mimeType, byteSize)
    .run();

  return mediaIntentResponse(request, env, mediaId, key, 201);
}

async function handleUploadMediaObject(request: Request, env: Env, userId: string): Promise<Response> {
  const mediaId = decodeURIComponent(new URL(request.url).pathname.split("/")[3] ?? "");

  if (!mediaId) {
    return errorResponse(request, env, 400, "media_required", "Media ID is required.");
  }

  const media = await env.DB.prepare(
    `SELECT id, r2_key, sha256, mime_type, byte_size
    FROM media_objects
    WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL
    LIMIT 1`
  )
    .bind(mediaId, userId)
    .first<{
      id: string;
      r2_key: string;
      sha256: string;
      mime_type: string;
      byte_size: number;
    }>();

  if (!media) {
    return errorResponse(request, env, 404, "media_not_found", "Media object was not found.");
  }

  const contentLength = request.headers.get("Content-Length");

  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength);

    if (!Number.isSafeInteger(parsedContentLength) || parsedContentLength !== media.byte_size) {
      return errorResponse(request, env, 400, "byte_size_mismatch", "Uploaded byte size does not match the intent.");
    }
  }

  const contentType = normalizeMimeType(request.headers.get("Content-Type"), null);

  if (contentType && contentType !== media.mime_type.toLowerCase()) {
    return errorResponse(request, env, 400, "mime_type_mismatch", "Uploaded MIME type does not match the intent.");
  }

  const body = await request.arrayBuffer();

  if (body.byteLength !== media.byte_size) {
    return errorResponse(request, env, 400, "byte_size_mismatch", "Uploaded byte size does not match the intent.");
  }

  const digest = await sha256Hex(body);

  if (digest !== media.sha256.toLowerCase()) {
    return errorResponse(request, env, 400, "sha256_mismatch", "Uploaded SHA-256 does not match the intent.");
  }

  await env.MEDIA_BUCKET.put(media.r2_key, body, {
    httpMetadata: { contentType: media.mime_type },
    customMetadata: { mediaId: media.id, ownerUserId: userId, sha256: media.sha256 }
  });

  return jsonResponse(request, env, { ok: true, mediaId: media.id, objectKey: media.r2_key });
}

function mediaIntentResponse(
  request: Request,
  env: Env,
  mediaId: string,
  objectKey: string,
  status: 200 | 201
): Response {
  return jsonResponse(
    request,
    env,
    {
      mediaId,
      objectKey,
      uploadUrl: `/media/objects/${encodeURIComponent(mediaId)}`,
      expiresInSeconds: 15 * 60
    },
    { status }
  );
}

async function handleRoomSocket(
  request: Request,
  env: Env,
  userId: string,
  sessionId: string
): Promise<Response> {
  const url = new URL(request.url);
  const roomId = url.pathname.split("/")[2];

  if (!roomId) {
    return errorResponse(request, env, 400, "room_required", "Room ID is required.");
  }

  if (!(await isActiveConversationMember(env, roomId, userId))) {
    return errorResponse(request, env, 403, "not_a_member", "You are not a member of this room.");
  }

  const id = env.CHAT_ROOMS.idFromName(roomId);
  const stub = env.CHAT_ROOMS.get(id);
  const headers = new Headers(request.headers);
  headers.set("X-User-Id", userId);
  headers.set("X-Session-Id", sessionId);

  return stub.fetch(new Request(request, { headers }));
}

async function isActiveConversationMember(env: Env, conversationId: string, userId: string): Promise<boolean> {
  const member = await env.DB.prepare(
    `SELECT 1 FROM conversation_members
    WHERE conversation_id = ? AND user_id = ? AND state = 'active'
    LIMIT 1`
  )
    .bind(conversationId, userId)
    .first();

  return Boolean(member);
}

function normalizeHandle(value: string): string | null {
  const handle = value.trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9_][a-z0-9_.-]{2,29}$/.test(handle) ? handle : null;
}

function normalizeMimeType(
  value: unknown,
  fallback: string | null = "application/octet-stream"
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const mimeType = value.split(";")[0]?.trim().toLowerCase() ?? "";

  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)
    ? mimeType
    : null;
}

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
