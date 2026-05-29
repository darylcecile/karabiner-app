import type { PluginDispatchEvent } from "@karabiner/shared";
import type { ChatRoom } from "./durable-objects/ChatRoom";

export interface Env {
  DB: D1Database;
  CHAT_ROOMS: DurableObjectNamespace<ChatRoom>;
  MEDIA_BUCKET: R2Bucket;
  PLUGIN_DISPATCH: Queue<PluginDispatchEvent>;
  ALLOWED_ORIGINS: string;
  APPLE_BUNDLE_ID: string;
  TOKEN_PEPPER: string;
}

export interface AuthenticatedUser {
  id: string;
  handle: string;
  displayName: string;
  sessionId: string;
}
