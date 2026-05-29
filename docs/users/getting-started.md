# Getting started

Karabiner is designed to work entirely from the app.

Early builds are iOS/iPadOS-only and may show sample conversations while backend account, conversation, and plugin installation wiring is completed.

## First run

1. Sign in with Apple.
2. Choose a handle. Handles are how other people mention and invite you.
3. Create or join a direct message or group.
4. Optionally connect an OpenClaw-compatible agent to a channel.

## Messaging

Messages are block-based. A single message can include text, code, quotes, media, agent events, and widgets. Widgets are interactive controls such as buttons, forms, pickers, and confirmations.

## Slash commands

Type `/` in the composer to invoke channel commands. Commands are provided by installed plugins and must be approved by the channel/user before they can run.

## Slug-mojis

Typing a slug between colons expands it to an emoji, such as `:shipit:` becoming 🚢. Group-specific custom slug-mojis are planned after the core messaging flow is stable.

## Agents

Agents such as OpenClaw are connected per channel. They receive only the scopes you approve and can be revoked later from channel settings.

In V1, agents are user-provided OpenClaw-compatible instances. Managed agent hosting and subscription tiers are planned for a later version.
