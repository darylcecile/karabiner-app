export const BUILTIN_AI_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "ollama",
  "copilot-cli",
] as const;

export type BuiltinAIProviderId = (typeof BUILTIN_AI_PROVIDER_IDS)[number];

export type AIProviderKind = "remote" | "local" | "cli";

export type AIModelCapability =
  | "chat"
  | "embeddings"
  | "tool-use"
  | "vision"
  | "streaming";

export type AIProviderDefinition = {
  id: string;
  displayName: string;
  kind: AIProviderKind;
  capabilities: AIModelCapability[];
  defaultModel?: string;
};

export type KaiMessageRole = "system" | "user" | "assistant" | "tool";

export type KaiChatMessage = {
  id: string;
  role: KaiMessageRole;
  content: string;
  createdAt: string;
  noteRefs?: string[];
};

export type RetrievalChunk = {
  noteId: string;
  path: string;
  score: number;
  excerpt: string;
};
