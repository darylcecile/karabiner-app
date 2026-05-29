export type ParticipantKind = "agent" | "user";

export interface ConversationParticipant {
  id: string;
  kind: ParticipantKind;
  displayName: string;
  handle: string;
  description: string;
  avatar: string;
}

export const agentParticipants: ConversationParticipant[] = [
  {
    id: "agent-openclaw",
    kind: "agent",
    displayName: "OpenClaw",
    handle: "@openclaw",
    description: "Scoped coding agent for repository tasks.",
    avatar: "🦞"
  },
  {
    id: "agent-design",
    kind: "agent",
    displayName: "Design Copilot",
    handle: "@design",
    description: "Reviews product flows and native interaction details.",
    avatar: "🎨"
  },
  {
    id: "agent-triage",
    kind: "agent",
    displayName: "Triage Agent",
    handle: "@triage",
    description: "Summarizes issues, pull requests, and release blockers.",
    avatar: "✨"
  }
];

export const userParticipants: ConversationParticipant[] = [
  {
    id: "user-avery",
    kind: "user",
    displayName: "Avery Stone",
    handle: "@avery",
    description: "Product partner and frequent collaborator.",
    avatar: "A"
  },
  {
    id: "user-sam",
    kind: "user",
    displayName: "Sam Rivera",
    handle: "@sam",
    description: "Mobile engineer focused on chat quality.",
    avatar: "S"
  },
  {
    id: "user-riley",
    kind: "user",
    displayName: "Riley Chen",
    handle: "@riley",
    description: "Design systems and accessibility reviewer.",
    avatar: "R"
  }
];

export const conversationParticipants: ConversationParticipant[] = [
  ...agentParticipants,
  ...userParticipants
];

export function findParticipant(id: string): ConversationParticipant | undefined {
  return conversationParticipants.find((participant) => participant.id === id);
}

