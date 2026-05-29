import type { Conversation, Message } from "@karabiner/shared";

const now = new Date().toISOString();

export const conversations: Conversation[] = [
  {
    id: "general",
    kind: "group",
    title: "General",
    visibility: "invite_only",
    createdAt: now,
    updatedAt: now,
    threadCount: 4,
    unreadCount: 3
  },
  {
    id: "openclaw-lab",
    kind: "agent",
    title: "OpenClaw Lab",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    threadCount: 2,
    unreadCount: 1
  },
  {
    id: "sage-assistant",
    kind: "agent",
    title: "Sage Assistant",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    threadCount: 0,
    unreadCount: 0
  },
  {
    id: "design-review",
    kind: "group",
    title: "Design Review",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    threadCount: 7,
    unreadCount: 0
  }
];

export const messages: Message[] = [
  {
    id: "msg-1",
    conversationId: "general",
    senderId: "user-avery",
    createdAt: now,
    blocks: [
      {
        type: "text",
        text: "Welcome to Karabiner. Try :shipit: or /summarize to see structured chat affordances."
      }
    ]
  },
  {
    id: "msg-2",
    conversationId: "general",
    senderId: "user-daryl",
    parentMessageId: "msg-1",
    createdAt: now,
    blocks: [
      {
        type: "widget",
        widget: {
          id: "launch-checklist",
          kind: "button_group",
          title: "Launch checklist",
          body: "Widgets use scoped actions instead of arbitrary client-side code.",
          actions: [
            { id: "approve", label: "Approve", style: "primary" },
            { id: "needs-work", label: "Needs work", style: "default" }
          ]
        }
      }
    ]
  },
  {
    id: "msg-2-root",
    conversationId: "general",
    senderId: "user-daryl",
    createdAt: now,
    blocks: [
      {
        type: "text",
        text: "Nice. I’ll try /summarize once OpenClaw has the right scope."
      }
    ]
  },
  {
    id: "msg-2-reply",
    conversationId: "general",
    senderId: "user-avery",
    createdAt: now,
    blocks: [
      {
        type: "text",
        text: "Perfect — mention @openclaw if you want the agent in the loop."
      }
    ]
  },
  {
    id: "msg-3",
    conversationId: "openclaw-lab",
    senderId: "agent-openclaw",
    createdAt: now,
    blocks: [
      {
        type: "agent_event",
        agentId: "openclaw",
        event: "thinking",
        title: "OpenClaw is connected with read/write message scope",
        detail: "Admin actions require an explicit user approval sheet."
      }
    ]
  },
  {
    id: "msg-4",
    conversationId: "sage-assistant",
    senderId: "agent-sage",
    createdAt: now,
    blocks: [
      {
        type: "text",
        text: "Hi, I’m Sage. Send a message and I’ll simulate an agent reply for manual testing."
      }
    ]
  }
];
