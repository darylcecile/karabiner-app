export const SDK_API_VERSION = 1 as const;

export type MaybePromise<T> = T | Promise<T>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ExtensionModule = {
  apiVersion: typeof SDK_API_VERSION;
  setup: ExtensionSetup;
};

export type ExtensionSetup = (runtime: ExtensionRuntime) => MaybePromise<void>;

export function registerExtension(setup: ExtensionSetup): ExtensionModule {
  return {
    apiVersion: SDK_API_VERSION,
    setup,
  };
}

export type ExtensionLifecycleContext = {
  extensionId: string;
  logger: ExtensionLogger;
};

export type ExtensionLifecycleHook = (
  context: ExtensionLifecycleContext,
) => MaybePromise<void>;

export type ExtensionRuntimeEvent =
  | "workspace.opened"
  | "workspace.closed"
  | "note.saved"
  | "note.opened"
  | "extension.enabled"
  | "extension.disabled";

export type ExtensionRuntime = {
  onActivate(handler: ExtensionLifecycleHook): void;
  onDeactivate(handler: ExtensionLifecycleHook): void;
  registerCommand(definition: ExtensionCommandDefinition): void;
  registerTool<I = JsonValue, O = JsonValue>(
    definition: ExtensionToolDefinition<I, O>,
  ): void;
  registerAIProvider(definition: ExtensionAIProviderDefinition): void;
  registerBlockNotePlugin(definition: ExtensionBlockNotePlugin): void;
  registerInlineEditorBlock(definition: ExtensionInlineEditorBlockDefinition): void;
  registerFilePreviewHandler(definition: ExtensionFilePreviewHandlerDefinition): void;
  registerEventHook(
    event: ExtensionRuntimeEvent,
    handler: ExtensionEventHandler,
  ): void;
};

export type ExtensionEventPayload = {
  timestamp: string;
  event: ExtensionRuntimeEvent;
  data?: JsonValue;
};

export type ExtensionEventHandler = (
  payload: ExtensionEventPayload,
  context: ExtensionExecutionContext,
) => MaybePromise<void>;

export type ExtensionExecutionContext = {
  extensionId: string;
  logger: ExtensionLogger;
  notes: ExtensionNotesAPI;
  workspace: ExtensionWorkspaceAPI;
  ai: ExtensionAIAPI;
  storage: ExtensionStorageAPI;
  network: ExtensionNetworkAPI;
  fs: ExtensionFilesystemAPI;
  cli: ExtensionCliAPI;
  git: ExtensionGitAPI;
};

export type ExtensionLogger = {
  debug(message: string, metadata?: JsonValue): void;
  info(message: string, metadata?: JsonValue): void;
  warn(message: string, metadata?: JsonValue): void;
  error(message: string, metadata?: JsonValue): void;
};

export type ExtensionCommandDefinition = {
  id: string;
  title: string;
  description?: string;
  run(context: ExtensionExecutionContext): MaybePromise<void>;
};

export type ExtensionToolDefinition<I = JsonValue, O = JsonValue> = {
  id: string;
  description: string;
  run(input: I, context: ExtensionExecutionContext): MaybePromise<O>;
};

export type ExtensionAIProviderDefinition = {
  id: string;
  displayName: string;
  kind: "remote" | "local" | "cli";
  capabilities: Array<"chat" | "embeddings" | "tool-use" | "vision" | "streaming">;
  defaultModel?: string;
};

export type ExtensionBlockNotePlugin = {
  id: string;
  setup(editor: BlockNoteEditorAdapter): MaybePromise<void>;
};

export type ExtensionInlineEditorBlockDefinition = {
  id: string;
  title: string;
  description?: string;
  run(context: ExtensionExecutionContext): MaybePromise<ExtensionInlineEditorBlockResult>;
};

export type ExtensionInlineEditorBlockResult = {
  markdown: string;
};

export type ExtensionFilePreviewHandlerDefinition = {
  id: string;
  title: string;
  description?: string;
  fileExtensions: string[];
  render(
    input: ExtensionFilePreviewInput,
    context: ExtensionExecutionContext,
  ): MaybePromise<ExtensionFilePreviewResult>;
};

export type ExtensionFilePreviewInput = {
  path: string;
  extension: string;
  fileName: string;
};

export type ExtensionFilePreviewResult = {
  title?: string;
  contentType?: "text" | "markdown" | "json" | "tldraw";
  content: string;
};

export type BlockNoteEditorAdapter = {
  addSlashCommand(command: BlockNoteSlashCommand): void;
  insertBlocks(blocks: BlockNoteBlock[]): void;
};

export type BlockNoteSlashCommand = {
  title: string;
  description?: string;
  onSelect(): void;
};

export type BlockNoteBlock = {
  type: string;
  content?: string;
  props?: Record<string, JsonValue>;
};

export type ExtensionNotesAPI = {
  list(): Promise<ExtensionNoteSummary[]>;
  read(noteId: string): Promise<ExtensionNoteDocument>;
  create(input: { title: string; markdown: string }): Promise<ExtensionNoteDocument>;
  update(
    noteId: string,
    input: { title?: string; markdown?: string },
  ): Promise<ExtensionNoteDocument>;
  getActiveEditor(): Promise<ExtensionActiveEditorAPI>;
};

export type ExtensionActiveEditorAPI = {
  getSelectionAsMarkdown(): Promise<string>;
  insertAtCursor(markdown: string): Promise<void>;
};

export type ExtensionNoteSummary = {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
};

export type ExtensionNoteDocument = ExtensionNoteSummary & {
  markdown: string;
};

export type ExtensionWorkspaceAPI = {
  root(): Promise<string | null>;
};

export type ExtensionAIAPI = {
  listProviders(): Promise<ExtensionAIProviderDefinition[]>;
  chat(input: {
    providerId?: string;
    model?: string;
    prompt: string;
  }): Promise<{ text: string }>;
  summarize(
    markdown: string,
    options?: { style?: "concise" | "detailed" },
  ): Promise<string>;
  embed(input: string | string[]): Promise<number[][]>;
};

export type ExtensionStorageAPI = {
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>;
  set<T extends JsonValue = JsonValue>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
};

export type ExtensionNetworkAPI = {
  fetch(
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
  }>;
};

export type ExtensionFilesystemAPI = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
};

export type ExtensionCliAPI = {
  exec(command: string, args?: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};


export type ExtensionGitAPI = {
  commitAndPush(options: {
	message: string;
	authorName?: string;
	authorEmail?: string;
	path?: string;
  }): Promise<void>;
};