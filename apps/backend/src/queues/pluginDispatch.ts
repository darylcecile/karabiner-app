import type { PluginDispatchEvent } from "@karabiner/shared";
import type { Env } from "../types";

export async function handlePluginDispatchQueue(
  batch: MessageBatch<PluginDispatchEvent>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const event = message.body;

    await env.DB.prepare(
      `INSERT INTO moderation_audit_log (id, conversation_id, actor_user_id, action, target_id, metadata_json)
      VALUES (?, ?, ?, 'plugin_dispatch_queued', ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        event.conversationId,
        event.actorUserId,
        event.pluginId,
        JSON.stringify({ eventId: event.id, type: event.type, createdAt: event.createdAt })
      )
      .run();
  }
}
