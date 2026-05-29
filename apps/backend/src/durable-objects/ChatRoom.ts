import {
  createEnvelopeId,
  isMessageBlock,
  isRealtimeEnvelope,
  isRecord,
  type RealtimeEnvelope
} from "@karabiner/shared";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

interface SocketAttachment {
  roomId: string;
  userId: string;
  sessionId: string;
  connectedAt: string;
}

export class ChatRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id");
    const sessionId = request.headers.get("X-Session-Id");
    const roomId = roomIdFromRequest(request);

    if (!userId || !sessionId || !roomId) {
      return new Response("Unauthorized WebSocket connection.", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const attachment: SocketAttachment = {
      roomId,
      userId,
      sessionId,
      connectedAt: new Date().toISOString()
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    this.broadcast({
      id: createEnvelopeId("presence"),
      type: "presence",
      conversationId: roomId,
      sentAt: new Date().toISOString(),
      payload: { userId, state: "online" }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = readAttachment(ws);

    if (!attachment) {
      ws.send(JSON.stringify(errorEnvelope("unknown", "socket_state_missing", "Missing socket state.")));
      ws.close(1008, "Missing socket state");
      return;
    }

    if (typeof message !== "string") {
      ws.send(
        JSON.stringify(
          errorEnvelope(attachment.roomId, "unsupported_frame", "Only text WebSocket frames are supported.")
        )
      );
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify(errorEnvelope(attachment.roomId, "invalid_json", "Message must be valid JSON.")));
      return;
    }

    if (!isRealtimeEnvelope(parsed) || parsed.conversationId !== attachment.roomId) {
      ws.send(
        JSON.stringify(
          errorEnvelope(attachment.roomId, "invalid_envelope", "Realtime envelope failed validation.")
        )
      );
      return;
    }

    if (parsed.type === "message.create" && !isMessageCreateEnvelope(parsed, attachment.roomId)) {
      ws.send(
        JSON.stringify(
          errorEnvelope(attachment.roomId, "invalid_message", "Message create envelope failed validation.")
        )
      );
      return;
    }

    if (parsed.type === "message.create" && parsed.payload.message.senderId !== attachment.userId) {
      ws.send(
        JSON.stringify(
          errorEnvelope(attachment.roomId, "sender_mismatch", "Message sender does not match session user.")
        )
      );
      return;
    }

    if (parsed.type === "message.create") {
      await this.persistMessage(parsed);
    }

    this.broadcast(parsed);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    const attachment = readAttachment(ws);

    if (attachment) {
      this.broadcast({
        id: createEnvelopeId("presence"),
        type: "presence",
        conversationId: attachment.roomId,
        sentAt: new Date().toISOString(),
        payload: { userId: attachment.userId, state: "offline" }
      });
    }
  }

  private async persistMessage(envelope: Extract<RealtimeEnvelope, { type: "message.create" }>): Promise<void> {
    const { message } = envelope.payload;

    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO messages
        (id, conversation_id, sender_id, parent_message_id, blocks_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        message.id,
        message.conversationId,
        message.senderId,
        message.parentMessageId ?? null,
        JSON.stringify(message.blocks),
        message.createdAt
      )
      .run();
  }

  private broadcast(envelope: RealtimeEnvelope): void {
    const encoded = JSON.stringify(envelope);

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(encoded);
      } catch {
        try {
          socket.close(1011, "Broadcast failed");
        } catch {
          // Ignore sockets that are already closing.
        }
      }
    }
  }
}

function roomIdFromRequest(request: Request): string | null {
  const match = new URL(request.url).pathname.match(/^\/rooms\/([^/]+)\/websocket$/);
  return match?.[1] ?? null;
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  const attachment: unknown = ws.deserializeAttachment();

  if (
    typeof attachment === "object" &&
    attachment !== null &&
    "roomId" in attachment &&
    "userId" in attachment &&
    "sessionId" in attachment &&
    "connectedAt" in attachment
  ) {
    return attachment as SocketAttachment;
  }

  return null;
}

function isMessageCreateEnvelope(
  value: RealtimeEnvelope,
  conversationId: string
): value is Extract<RealtimeEnvelope, { type: "message.create" }> {
  return (
    value.type === "message.create" &&
    isRecord(value.payload.message) &&
    typeof value.payload.message.id === "string" &&
    value.payload.message.conversationId === conversationId &&
    typeof value.payload.message.senderId === "string" &&
    Array.isArray(value.payload.message.blocks) &&
    value.payload.message.blocks.every(isMessageBlock) &&
    typeof value.payload.message.createdAt === "string" &&
    (typeof value.payload.message.parentMessageId === "string" ||
      value.payload.message.parentMessageId === undefined)
  );
}

function errorEnvelope(
  conversationId: string,
  code: string,
  message: string
): Extract<RealtimeEnvelope, { type: "error" }> {
  return {
    id: createEnvelopeId("error"),
    type: "error",
    conversationId,
    sentAt: new Date().toISOString(),
    payload: { code, message }
  };
}
