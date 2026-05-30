import type { Conversation, Message, MessageBlock } from "@karabiner/shared";
import { CURRENT_USER_ID } from "./participants";

export function agentSenderId(conversation: Conversation): string {
  if (conversation.id === "openclaw-lab") {
    return "agent-openclaw";
  }

  if (conversation.id === "sage-assistant") {
    return "agent-sage";
  }

  return `agent-${conversation.id}`;
}

export function conversationAgentName(conversation: Conversation): string {
  if (conversation.id === "openclaw-lab") {
    return "OpenClaw";
  }

  if (conversation.kind === "agent") {
    return conversation.title.replace(/\s+(assistant|agent)$/i, "") || "Agent";
  }

  return "Avery";
}

export function simulatedAgentReply(conversation: Conversation): string {
  return `${conversationAgentName(conversation)} received your message and is ready to help.`;
}

export function isOwnMessage(message: Message): boolean {
  return message.senderId === CURRENT_USER_ID;
}

export function blockText(block: MessageBlock): string {
  switch (block.type) {
    case "text":
    case "quote":
      return block.text;
    case "code":
      return block.code;
    case "file":
      return block.fileName;
    case "image":
      return block.alt;
    default:
      return "";
  }
}

export function messageSnippet(message: Message): string {
  if (message.deletedAt) {
    return "Message deleted";
  }

  const snippet = message.blocks.map(blockText).filter(Boolean).join(" ").trim();
  return snippet || "Message";
}

let localCounter = 0;
export function nextLocalId(prefix: string): string {
  localCounter += 1;
  return `${prefix}-${Date.now()}-${localCounter}`;
}
