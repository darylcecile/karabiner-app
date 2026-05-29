# OpenClaw channel plugins

OpenClaw-style integrations connect to Karabiner as scoped channel plugins. A plugin can provide slash commands, message widgets, agent events, and webhook callbacks, but it does not get unrestricted user or group access.

Current implementation status: shared manifest/event types, plugin installation storage, nonce storage, and queue/audit plumbing exist. Public manifest registration, callback endpoints, and revocation UI are still being built, so treat this as the V1 contract target rather than a finished external API.

## Manifest

```json
{
  "id": "plugin-openclaw-example",
  "name": "OpenClaw",
  "version": "1.0.0",
  "description": "Connects a user-owned OpenClaw instance to a Karabiner channel.",
  "webhookUrl": "https://openclaw.example.com/karabiner/events",
  "requestedScopes": ["plugin:read", "plugin:write", "messages:read", "messages:write"],
  "slashCommands": [
    {
      "id": "summarize",
      "pluginId": "plugin-openclaw-example",
      "name": "summarize",
      "description": "Summarize the current thread.",
      "argumentHint": "[optional focus]",
      "requiredScopes": ["messages:read", "messages:write"]
    }
  ],
  "privacyUrl": "https://openclaw.example.com/privacy"
}
```

## Event delivery

Plugin event payloads follow the shared `PluginDispatchEvent` shape:

```json
{
  "id": "plugin_123",
  "pluginId": "plugin-openclaw-example",
  "conversationId": "general",
  "actorUserId": "user_123",
  "type": "slash_command",
  "payload": {
    "command": "summarize",
    "args": "last 20 messages"
  },
  "createdAt": "2026-05-27T18:40:13.827Z"
}
```

Production webhooks must include:

- `X-Karabiner-Signature: sha256=<hex>` using the plugin installation secret;
- `X-Karabiner-Timestamp`;
- `X-Karabiner-Nonce`.

The receiver must reject stale timestamps and reused nonces.

Inbound callbacks from plugins will use the same timestamp/nonce/signature requirements before they can mutate Karabiner state.

## Scope expectations

| Scope | Allows |
| --- | --- |
| `plugin:read` | Read installation metadata and allowed channel metadata. |
| `plugin:write` | Emit plugin results and widget states. |
| `messages:read` | Read messages explicitly available to the plugin installation. |
| `messages:write` | Send messages, thread replies, and agent-event blocks. |
| `media:read` | Read media metadata or short-lived media URLs explicitly available to the installation. |
| `media:write` | Attach plugin-generated media through approved upload intents. |
| `plugin:admin` | Perform approved moderation/channel actions. |

Admin scopes should trigger a user approval sheet in the app before installation.

## Builder expectations

- Host your OpenClaw instance and expose HTTPS webhooks; Karabiner does not run plugin code in the app.
- Request the smallest useful scope set. Read/write message scopes are enough for most slash commands and agent-event blocks.
- Store installation secrets securely and rotate them if a user revokes/reconnects the plugin.
- Avoid sending private message bodies or media URLs to third-party services outside the user-approved OpenClaw instance.
