import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AIProviderDefinition } from "../../shared/contracts/ai";
import type { InstalledExtension } from "../../shared/contracts/extensions";

export type BuiltinProviderId = "anthropic" | "openai" | "ollama" | "copilot-cli";

export type ProviderCredentials = {
  apiKey?: string;
  baseURL?: string;
};

const BUILTIN_PROVIDER_CATALOG: AIProviderDefinition[] = [
  {
    id: "anthropic",
    displayName: "Anthropic",
    kind: "remote",
    capabilities: ["chat", "embeddings", "streaming", "tool-use"],
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "openai",
    displayName: "OpenAI",
    kind: "remote",
    capabilities: ["chat", "embeddings", "streaming", "tool-use", "vision"],
    defaultModel: "gpt-4.1",
  },
  {
    id: "ollama",
    displayName: "Ollama",
    kind: "local",
    capabilities: ["chat", "embeddings", "streaming"],
    defaultModel: "qwen3:latest",
  },
  {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    kind: "cli",
    capabilities: ["chat"],
    defaultModel: "gpt-5",
  },
];

export function listBuiltinProviders(): AIProviderDefinition[] {
  return BUILTIN_PROVIDER_CATALOG.map((provider) => ({ ...provider }));
}

export function listAllProviders(
  installedExtensions: InstalledExtension[],
  runtimeProviders: AIProviderDefinition[] = [],
): AIProviderDefinition[] {
  const providers = new Map<string, AIProviderDefinition>();

  for (const provider of BUILTIN_PROVIDER_CATALOG) {
    providers.set(provider.id, provider);
  }

  for (const extension of installedExtensions) {
    for (const provider of extension.manifest.contributes?.aiProviders ?? []) {
      providers.set(provider.id, provider);
    }
  }

  for (const provider of runtimeProviders) {
    providers.set(provider.id, provider);
  }

  return [...providers.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

export function createBuiltinLanguageModel(params: {
  providerId: BuiltinProviderId;
  modelId?: string;
  credentials?: ProviderCredentials;
}): LanguageModel | null {
  if (params.providerId === "anthropic") {
    if (!params.credentials?.apiKey) {
      return null;
    }
    const anthropic = createAnthropic({
      apiKey: params.credentials.apiKey,
      baseURL: params.credentials.baseURL,
    });
    return anthropic(params.modelId ?? "claude-sonnet-4-5");
  }

  if (params.providerId === "openai") {
    if (!params.credentials?.apiKey) {
      return null;
    }
    const openai = createOpenAI({
      apiKey: params.credentials.apiKey,
      baseURL: params.credentials.baseURL,
    });
    return openai(params.modelId ?? "gpt-4.1");
  }

  return null;
}
