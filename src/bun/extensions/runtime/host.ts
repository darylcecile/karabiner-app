import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";
import { Utils } from "electrobun/bun";
import { newAsyncContext, type QuickJSAsyncContext, type QuickJSHandle } from "quickjs-emscripten";
import type { AIProviderDefinition } from "../../../shared/contracts/ai";
import type {
  ExtensionFilePreviewHandlerContribution,
  ExtensionFilePreviewRenderResult,
  ExtensionInlineEditorBlockContribution,
  ExtensionInlineEditorBlockResult,
  ExtensionResolvedFilePreview,
  InstalledExtension,
} from "../../../shared/contracts/extensions";
import { listAllProviders } from "../../ai/providers";
import {
  getWorkspaceRoot,
  listNotes,
  readNote,
  saveNote,
} from "../../notes/storage";
import { createInstalledExtensionRecord, loadExtensionManifest } from "../manifest";
import { installOfficialExtensions } from "../official/extensions";
import { ExtensionPermissionGate } from "../permissions";
import { ExtensionRegistry } from "../registry";
import { prepareExtensionRuntimeEntrypoint } from "./compiler";
import {
  KARABINER_SDK_MODULE_SOURCE,
  KARABINER_SDK_MODULE_SPECIFIER,
} from "./sdk-module";

const EXTENSIONS_DIRECTORY = join(Utils.paths.userData, "extensions");
const RUNTIME_STORAGE_FILENAME = "runtime-storage.json";
const QUICKJS_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const QUICKJS_MAX_STACK_BYTES = 512 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const MAX_NETWORK_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_BLOCK_MARKDOWN_BYTES = 256 * 1024;
const MAX_FILE_PREVIEW_CONTENT_BYTES = 2 * 1024 * 1024;

type ExtensionRuntimeEvent =
  | "workspace.opened"
  | "workspace.closed"
  | "note.saved"
  | "note.opened"
  | "extension.enabled"
  | "extension.disabled";

type RegisteredCommand = {
  id: string;
  title: string;
  description?: string;
  runHandler: QuickJSHandle;
};

type RegisteredTool = {
  id: string;
  description: string;
  runHandler: QuickJSHandle;
};

type RegisteredBlockNotePlugin = {
  id: string;
  setupHandler: QuickJSHandle;
};

type RegisteredInlineEditorBlock = {
  id: string;
  title: string;
  description?: string;
  runHandler: QuickJSHandle;
};

type RegisteredFilePreviewHandler = {
  id: string;
  title: string;
  description?: string;
  fileExtensions: string[];
  renderHandler: QuickJSHandle;
};

type ActiveExtensionRuntime = {
  extension: InstalledExtension;
  gate: ExtensionPermissionGate;
  context: QuickJSAsyncContext;
  runtimeApiHandle: QuickJSHandle;
  storage: Map<string, unknown>;
  activateHandler?: QuickJSHandle;
  deactivateHandler?: QuickJSHandle;
  eventHandlers: Map<ExtensionRuntimeEvent, QuickJSHandle[]>;
  commands: Map<string, RegisteredCommand>;
  tools: Map<string, RegisteredTool>;
  aiProviders: Map<string, AIProviderDefinition>;
  blockNotePlugins: Map<string, RegisteredBlockNotePlugin>;
  inlineEditorBlocks: Map<string, RegisteredInlineEditorBlock>;
  filePreviewHandlers: Map<string, RegisteredFilePreviewHandler>;
};

type ExtensionRuntimeHostOptions = {
  getActiveEditorSelectionAsMarkdown?: () => Promise<string>;
  insertAtActiveEditorCursor?: (markdown: string) => Promise<void>;
};

export class ExtensionRuntimeHost {
  private readonly extensionRegistry: ExtensionRegistry;
  private readonly options: ExtensionRuntimeHostOptions;
  private readonly activeRuntimes = new Map<string, ActiveExtensionRuntime>();

  constructor(
    extensionRegistry: ExtensionRegistry,
    options: ExtensionRuntimeHostOptions = {},
  ) {
    this.extensionRegistry = extensionRegistry;
    this.options = options;
  }

  async initialize(): Promise<void> {
    await mkdir(EXTENSIONS_DIRECTORY, { recursive: true });
    await installOfficialExtensions(EXTENSIONS_DIRECTORY);
    await this.discoverInstalledExtensions();
    await this.activateRegisteredExtensions();
  }

  listContributedAIProviders(): AIProviderDefinition[] {
    const providers = new Map<string, AIProviderDefinition>();
    for (const runtime of this.activeRuntimes.values()) {
      for (const provider of runtime.aiProviders.values()) {
        providers.set(provider.id, provider);
      }
    }
    return [...providers.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  listContributedInlineEditorBlocks(): ExtensionInlineEditorBlockContribution[] {
    const blocks = new Map<string, ExtensionInlineEditorBlockContribution>();
    for (const runtime of this.activeRuntimes.values()) {
      for (const block of runtime.inlineEditorBlocks.values()) {
        blocks.set(block.id, {
          id: block.id,
          title: block.title,
          description: block.description,
        });
      }
    }
    return [...blocks.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }

  listContributedFilePreviewHandlers(): ExtensionFilePreviewHandlerContribution[] {
    const handlers = new Map<string, ExtensionFilePreviewHandlerContribution>();
    for (const runtime of this.activeRuntimes.values()) {
      for (const handler of runtime.filePreviewHandlers.values()) {
        handlers.set(handler.id, {
          id: handler.id,
          title: handler.title,
          description: handler.description,
          fileExtensions: [...handler.fileExtensions],
        });
      }
    }
    return [...handlers.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }

  async invokeCommand(commandId: string): Promise<void> {
    const registration = this.findCommandRegistration(commandId);
    if (!registration) {
      throw new Error(`No active extension command found for "${commandId}".`);
    }

    const executionContextHandle = this.createExecutionContextHandle(
      registration.runtime,
    );
    try {
      const resultHandle = await this.callExtensionFunction(
        registration.runtime.context,
        registration.command.runHandler,
        registration.runtime.context.undefined,
        [executionContextHandle],
      );
      resultHandle.dispose();
    } finally {
      executionContextHandle.dispose();
    }
  }

  async invokeTool(input: {
    toolId: string;
    payload: unknown;
  }): Promise<unknown> {
    const registration = this.findToolRegistration(input.toolId);
    if (!registration) {
      throw new Error(`No active extension tool found for "${input.toolId}".`);
    }

    const payloadHandle = this.toQuickJSHandle(
      registration.runtime.context,
      input.payload,
    );
    const executionContextHandle = this.createExecutionContextHandle(
      registration.runtime,
    );
    try {
      const resultHandle = await this.callExtensionFunction(
        registration.runtime.context,
        registration.tool.runHandler,
        registration.runtime.context.undefined,
        [payloadHandle, executionContextHandle],
      );
      const result = registration.runtime.context.dump(resultHandle);
      resultHandle.dispose();
      return result;
    } finally {
      payloadHandle.dispose();
      executionContextHandle.dispose();
    }
  }

  async invokeInlineEditorBlock(
    blockId: string,
  ): Promise<ExtensionInlineEditorBlockResult> {
    const registration = this.findInlineEditorBlockRegistration(blockId);
    if (!registration) {
      throw new Error(`No active inline editor block found for "${blockId}".`);
    }
    registration.runtime.gate.require(
      "notes.write",
      "runtime.invokeInlineEditorBlock",
    );

    const executionContextHandle = this.createExecutionContextHandle(
      registration.runtime,
    );
    try {
      const resultHandle = await this.callExtensionFunction(
        registration.runtime.context,
        registration.block.runHandler,
        registration.runtime.context.undefined,
        [executionContextHandle],
      );
      const result = this.normalizeInlineEditorBlockResult(
        registration.runtime.context.dump(resultHandle),
      );
      resultHandle.dispose();
      return result;
    } finally {
      executionContextHandle.dispose();
    }
  }

  async renderFilePreview(path: string): Promise<ExtensionResolvedFilePreview | null> {
    const registration = this.findFilePreviewHandlerRegistration(path);
    if (!registration) {
      return null;
    }
    const context = registration.runtime.context;
    const extension = extname(path).toLowerCase();
    const inputHandle = this.toQuickJSHandle(context, {
      path,
      extension,
      fileName: basename(path),
    });
    const executionContextHandle = this.createExecutionContextHandle(
      registration.runtime,
    );
    try {
      const resultHandle = await this.callExtensionFunction(
        context,
        registration.handler.renderHandler,
        context.undefined,
        [inputHandle, executionContextHandle],
      );
      const result = this.normalizeFilePreviewRenderResult(
        path,
        registration.handler,
        context.dump(resultHandle),
      );
      resultHandle.dispose();
      return result;
    } finally {
      inputHandle.dispose();
      executionContextHandle.dispose();
    }
  }

  async dispose(): Promise<void> {
    for (const runtime of this.activeRuntimes.values()) {
      await this.deactivateRuntime(runtime);
    }
    this.activeRuntimes.clear();
  }

  private async discoverInstalledExtensions(): Promise<void> {
    const entries = await readdir(EXTENSIONS_DIRECTORY, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const extensionRoot = join(EXTENSIONS_DIRECTORY, entry.name);
      try {
        const manifestResult = await loadExtensionManifest(extensionRoot);
        if (!manifestResult.ok) {
          console.error(
            `[extensions] skipping "${extensionRoot}" due to invalid manifest`,
            manifestResult.issues,
          );
          continue;
        }

        this.extensionRegistry.register(
          createInstalledExtensionRecord({
            extensionRoot,
            manifest: manifestResult.manifest,
            installSource: {
              type: "local-path",
              path: extensionRoot,
            },
          }),
        );
      } catch (error: unknown) {
        console.error(`[extensions] failed to load extension at ${extensionRoot}`, error);
      }
    }
  }

  private async activateRegisteredExtensions(): Promise<void> {
    for (const extension of this.extensionRegistry.list()) {
      try {
        await this.activateExtension(extension);
      } catch (error: unknown) {
        console.error(
          `[extensions] failed to activate ${extension.manifest.id}`,
          error,
        );
      }
    }
  }

  private async activateExtension(extension: InstalledExtension): Promise<void> {
    if (this.activeRuntimes.has(extension.manifest.id)) {
      return;
    }

    const runtimeEntrypoint = await prepareExtensionRuntimeEntrypoint(extension);
    const entrypointSource = await readFile(runtimeEntrypoint, "utf8");
    const context = await newAsyncContext();
    context.runtime.setMemoryLimit(QUICKJS_MEMORY_LIMIT_BYTES);
    context.runtime.setMaxStackSize(QUICKJS_MAX_STACK_BYTES);
    context.runtime.setModuleLoader(async (moduleName) => {
      if (moduleName === KARABINER_SDK_MODULE_SPECIFIER) {
        return KARABINER_SDK_MODULE_SOURCE;
      }
      throw new Error(
        `Unsupported module import "${moduleName}" in extension "${extension.manifest.id}".`,
      );
    });

    const runtimeState: ActiveExtensionRuntime = {
      extension,
      gate: new ExtensionPermissionGate(extension.manifest.permissions),
      context,
      runtimeApiHandle: context.undefined.dup(),
      storage: await this.loadRuntimeStorage(extension),
      eventHandlers: new Map(),
      commands: new Map(),
      tools: new Map(),
      aiProviders: new Map(),
      blockNotePlugins: new Map(),
      inlineEditorBlocks: new Map(),
      filePreviewHandlers: new Map(),
    };

    runtimeState.runtimeApiHandle.dispose();
    runtimeState.runtimeApiHandle = this.createRuntimeApiHandle(runtimeState);

    try {
      const exportsHandle = await this.evaluateExtensionModule(
        context,
        entrypointSource,
        runtimeEntrypoint,
      );
      try {
        const setupHandler = this.resolveSetupHandler(context, exportsHandle);
        try {
          const setupResultHandle = await this.callExtensionFunction(
            context,
            setupHandler,
            context.undefined,
            [runtimeState.runtimeApiHandle],
          );
          setupResultHandle.dispose();
        } finally {
          setupHandler.dispose();
        }
      } finally {
        exportsHandle.dispose();
      }

      this.activeRuntimes.set(extension.manifest.id, runtimeState);
      if (runtimeState.activateHandler) {
        await this.invokeLifecycleHook(runtimeState, runtimeState.activateHandler);
      }
      this.broadcastEvent("extension.enabled", {
        extensionId: extension.manifest.id,
      });
    } catch (error: unknown) {
      await this.disposeRuntime(runtimeState);
      throw error;
    }
  }

  private async deactivateRuntime(runtime: ActiveExtensionRuntime): Promise<void> {
    if (runtime.deactivateHandler) {
      try {
        await this.invokeLifecycleHook(runtime, runtime.deactivateHandler);
      } catch (error: unknown) {
        console.error(
          `[extensions] deactivate hook failed for ${runtime.extension.manifest.id}`,
          error,
        );
      }
    }

    this.broadcastEvent("extension.disabled", {
      extensionId: runtime.extension.manifest.id,
    });
    await this.persistRuntimeStorage(runtime);
    await this.disposeRuntime(runtime);
  }

  private async disposeRuntime(runtime: ActiveExtensionRuntime): Promise<void> {
    for (const command of runtime.commands.values()) {
      command.runHandler.dispose();
    }
    for (const tool of runtime.tools.values()) {
      tool.runHandler.dispose();
    }
    for (const plugin of runtime.blockNotePlugins.values()) {
      plugin.setupHandler.dispose();
    }
    for (const block of runtime.inlineEditorBlocks.values()) {
      block.runHandler.dispose();
    }
    for (const handler of runtime.filePreviewHandlers.values()) {
      handler.renderHandler.dispose();
    }
    for (const handlers of runtime.eventHandlers.values()) {
      for (const handler of handlers) {
        handler.dispose();
      }
    }
    runtime.activateHandler?.dispose();
    runtime.deactivateHandler?.dispose();
    runtime.runtimeApiHandle.dispose();
    runtime.context.dispose();
  }

  private async evaluateExtensionModule(
    context: QuickJSAsyncContext,
    source: string,
    filename: string,
  ): Promise<QuickJSHandle> {
    const moduleResult = await context.evalCodeAsync(source, filename, {
      type: "module",
      strict: true,
    });
    const moduleValueHandle = context.unwrapResult(moduleResult);
    return this.resolveMaybePromiseHandle(context, moduleValueHandle);
  }

  private resolveSetupHandler(
    context: QuickJSAsyncContext,
    exportsHandle: QuickJSHandle,
  ): QuickJSHandle {
    const defaultExportHandle = context.getProp(exportsHandle, "default");
    try {
      const defaultExportType = context.typeof(defaultExportHandle);
      if (defaultExportType === "function") {
        return defaultExportHandle.dup();
      }
      if (defaultExportType !== "object") {
        throw new Error("Extension default export must be an object or function.");
      }

      const setupHandle = context.getProp(defaultExportHandle, "setup");
      try {
        if (context.typeof(setupHandle) !== "function") {
          throw new Error('Extension default export must define a "setup" function.');
        }
        return setupHandle.dup();
      } finally {
        setupHandle.dispose();
      }
    } finally {
      defaultExportHandle.dispose();
    }
  }

  private createRuntimeApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const runtimeHandle = context.newObject();

    const onActivateHandle = context.newFunction(
      "onActivate",
      (handlerHandle) => {
        if (context.typeof(handlerHandle) !== "function") {
          throw new Error("onActivate expects a function.");
        }
        runtime.activateHandler?.dispose();
        runtime.activateHandler = handlerHandle.dup();
      },
    );
    context.setProp(runtimeHandle, "onActivate", onActivateHandle);
    onActivateHandle.dispose();

    const onDeactivateHandle = context.newFunction(
      "onDeactivate",
      (handlerHandle) => {
        if (context.typeof(handlerHandle) !== "function") {
          throw new Error("onDeactivate expects a function.");
        }
        runtime.deactivateHandler?.dispose();
        runtime.deactivateHandler = handlerHandle.dup();
      },
    );
    context.setProp(runtimeHandle, "onDeactivate", onDeactivateHandle);
    onDeactivateHandle.dispose();

    const registerCommandHandle = context.newFunction(
      "registerCommand",
      (definitionHandle) => {
        const command = this.readCommandDefinition(runtime, definitionHandle);
        const existing = runtime.commands.get(command.id);
        existing?.runHandler.dispose();
        runtime.commands.set(command.id, command);
      },
    );
    context.setProp(runtimeHandle, "registerCommand", registerCommandHandle);
    registerCommandHandle.dispose();

    const registerToolHandle = context.newFunction(
      "registerTool",
      (definitionHandle) => {
        const tool = this.readToolDefinition(runtime, definitionHandle);
        const existing = runtime.tools.get(tool.id);
        existing?.runHandler.dispose();
        runtime.tools.set(tool.id, tool);
      },
    );
    context.setProp(runtimeHandle, "registerTool", registerToolHandle);
    registerToolHandle.dispose();

    const registerAIProviderHandle = context.newFunction(
      "registerAIProvider",
      (definitionHandle) => {
        const provider = this.readAIProviderDefinition(runtime, definitionHandle);
        runtime.aiProviders.set(provider.id, provider);
      },
    );
    context.setProp(runtimeHandle, "registerAIProvider", registerAIProviderHandle);
    registerAIProviderHandle.dispose();

    const registerBlockNotePluginHandle = context.newFunction(
      "registerBlockNotePlugin",
      (definitionHandle) => {
        const plugin = this.readBlockNotePluginDefinition(runtime, definitionHandle);
        const existing = runtime.blockNotePlugins.get(plugin.id);
        existing?.setupHandler.dispose();
        runtime.blockNotePlugins.set(plugin.id, plugin);
      },
    );
    context.setProp(
      runtimeHandle,
      "registerBlockNotePlugin",
      registerBlockNotePluginHandle,
    );
    registerBlockNotePluginHandle.dispose();

    const registerInlineEditorBlockHandle = context.newFunction(
      "registerInlineEditorBlock",
      (definitionHandle) => {
        const block = this.readInlineEditorBlockDefinition(runtime, definitionHandle);
        const existing = runtime.inlineEditorBlocks.get(block.id);
        existing?.runHandler.dispose();
        runtime.inlineEditorBlocks.set(block.id, block);
      },
    );
    context.setProp(
      runtimeHandle,
      "registerInlineEditorBlock",
      registerInlineEditorBlockHandle,
    );
    registerInlineEditorBlockHandle.dispose();

    const registerFilePreviewHandlerHandle = context.newFunction(
      "registerFilePreviewHandler",
      (definitionHandle) => {
        const handler = this.readFilePreviewHandlerDefinition(runtime, definitionHandle);
        const existing = runtime.filePreviewHandlers.get(handler.id);
        existing?.renderHandler.dispose();
        runtime.filePreviewHandlers.set(handler.id, handler);
      },
    );
    context.setProp(
      runtimeHandle,
      "registerFilePreviewHandler",
      registerFilePreviewHandlerHandle,
    );
    registerFilePreviewHandlerHandle.dispose();

    const registerEventHookHandle = context.newFunction(
      "registerEventHook",
      (eventHandle, handlerHandle) => {
        const event = this.readRuntimeEvent(runtime, eventHandle);
        if (context.typeof(handlerHandle) !== "function") {
          throw new Error("registerEventHook expects a function handler.");
        }
        const handlers = runtime.eventHandlers.get(event) ?? [];
        handlers.push(handlerHandle.dup());
        runtime.eventHandlers.set(event, handlers);
      },
    );
    context.setProp(runtimeHandle, "registerEventHook", registerEventHookHandle);
    registerEventHookHandle.dispose();

    return runtimeHandle;
  }

  private readCommandDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): RegisteredCommand {
    const id = this.readRequiredStringProperty(runtime, definitionHandle, "id");
    const title = this.readRequiredStringProperty(runtime, definitionHandle, "title");
    const description = this.readOptionalStringProperty(
      runtime,
      definitionHandle,
      "description",
    );
    const runHandler = this.readRequiredFunctionProperty(
      runtime,
      definitionHandle,
      "run",
    );
    return { id, title, description, runHandler };
  }

  private readToolDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): RegisteredTool {
    const id = this.readRequiredStringProperty(runtime, definitionHandle, "id");
    const description = this.readRequiredStringProperty(
      runtime,
      definitionHandle,
      "description",
    );
    const runHandler = this.readRequiredFunctionProperty(
      runtime,
      definitionHandle,
      "run",
    );
    return { id, description, runHandler };
  }

  private readBlockNotePluginDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): RegisteredBlockNotePlugin {
    const id = this.readRequiredStringProperty(runtime, definitionHandle, "id");
    const setupHandler = this.readRequiredFunctionProperty(
      runtime,
      definitionHandle,
      "setup",
    );
    return { id, setupHandler };
  }

  private readInlineEditorBlockDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): RegisteredInlineEditorBlock {
    const id = this.readRequiredStringProperty(runtime, definitionHandle, "id");
    const title = this.readRequiredStringProperty(runtime, definitionHandle, "title");
    const description = this.readOptionalStringProperty(
      runtime,
      definitionHandle,
      "description",
    );
    const runHandler = this.readRequiredFunctionProperty(
      runtime,
      definitionHandle,
      "run",
    );
    return { id, title, description, runHandler };
  }

  private readFilePreviewHandlerDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): RegisteredFilePreviewHandler {
    const id = this.readRequiredStringProperty(runtime, definitionHandle, "id");
    const title = this.readRequiredStringProperty(runtime, definitionHandle, "title");
    const description = this.readOptionalStringProperty(
      runtime,
      definitionHandle,
      "description",
    );
    const fileExtensions = this.readRequiredStringArrayProperty(
      runtime,
      definitionHandle,
      "fileExtensions",
    )
      .map((fileExtension) => normalizeFileExtension(fileExtension))
      .filter((fileExtension, index, all) => all.indexOf(fileExtension) === index);
    if (fileExtensions.length === 0) {
      throw new Error(
        'registerFilePreviewHandler requires at least one "fileExtensions" entry.',
      );
    }
    const renderHandler = this.readRequiredFunctionProperty(
      runtime,
      definitionHandle,
      "render",
    );
    return { id, title, description, fileExtensions, renderHandler };
  }

  private readAIProviderDefinition(
    runtime: ActiveExtensionRuntime,
    definitionHandle: QuickJSHandle,
  ): AIProviderDefinition {
    const dumped = runtime.context.dump(definitionHandle);
    if (!isAIProviderDefinition(dumped)) {
      throw new Error("registerAIProvider received an invalid provider definition.");
    }
    return dumped;
  }

  private readRuntimeEvent(
    runtime: ActiveExtensionRuntime,
    valueHandle: QuickJSHandle,
  ): ExtensionRuntimeEvent {
    const event = this.readHandleAsString(runtime.context, valueHandle);
    if (
      event !== "workspace.opened" &&
      event !== "workspace.closed" &&
      event !== "note.saved" &&
      event !== "note.opened" &&
      event !== "extension.enabled" &&
      event !== "extension.disabled"
    ) {
      throw new Error(`Unknown extension runtime event "${event}".`);
    }
    return event;
  }

  private readRequiredStringProperty(
    runtime: ActiveExtensionRuntime,
    objectHandle: QuickJSHandle,
    property: string,
  ): string {
    const valueHandle = runtime.context.getProp(objectHandle, property);
    try {
      return this.readHandleAsString(runtime.context, valueHandle, property);
    } finally {
      valueHandle.dispose();
    }
  }

  private readOptionalStringProperty(
    runtime: ActiveExtensionRuntime,
    objectHandle: QuickJSHandle,
    property: string,
  ): string | undefined {
    const valueHandle = runtime.context.getProp(objectHandle, property);
    try {
      if (runtime.context.typeof(valueHandle) === "undefined") {
        return undefined;
      }
      return this.readHandleAsString(runtime.context, valueHandle, property);
    } finally {
      valueHandle.dispose();
    }
  }

  private readRequiredStringArrayProperty(
    runtime: ActiveExtensionRuntime,
    objectHandle: QuickJSHandle,
    property: string,
  ): string[] {
    const valueHandle = runtime.context.getProp(objectHandle, property);
    try {
      const dumped = runtime.context.dump(valueHandle);
      if (!Array.isArray(dumped) || dumped.some((item) => typeof item !== "string")) {
        throw new Error(`Expected "${property}" to be an array of strings.`);
      }
      return dumped as string[];
    } finally {
      valueHandle.dispose();
    }
  }

  private readRequiredFunctionProperty(
    runtime: ActiveExtensionRuntime,
    objectHandle: QuickJSHandle,
    property: string,
  ): QuickJSHandle {
    const valueHandle = runtime.context.getProp(objectHandle, property);
    try {
      if (runtime.context.typeof(valueHandle) !== "function") {
        throw new Error(`Expected "${property}" to be a function.`);
      }
      return valueHandle.dup();
    } finally {
      valueHandle.dispose();
    }
  }

  private async invokeLifecycleHook(
    runtime: ActiveExtensionRuntime,
    hook: QuickJSHandle,
  ): Promise<void> {
    const lifecycleContextHandle = this.createLifecycleContextHandle(runtime);
    try {
      const resultHandle = await this.callExtensionFunction(
        runtime.context,
        hook,
        runtime.context.undefined,
        [lifecycleContextHandle],
      );
      resultHandle.dispose();
    } finally {
      lifecycleContextHandle.dispose();
    }
  }

  private createLifecycleContextHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const lifecycleHandle = context.newObject();

    const extensionIdHandle = context.newString(runtime.extension.manifest.id);
    context.setProp(lifecycleHandle, "extensionId", extensionIdHandle);
    extensionIdHandle.dispose();

    const loggerHandle = this.createLoggerHandle(runtime);
    context.setProp(lifecycleHandle, "logger", loggerHandle);
    loggerHandle.dispose();

    return lifecycleHandle;
  }

  private createExecutionContextHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const executionContextHandle = this.createLifecycleContextHandle(runtime);

    const notesHandle = this.createNotesApiHandle(runtime);
    context.setProp(executionContextHandle, "notes", notesHandle);
    notesHandle.dispose();

    const workspaceHandle = this.createWorkspaceApiHandle(runtime);
    context.setProp(executionContextHandle, "workspace", workspaceHandle);
    workspaceHandle.dispose();

    const aiHandle = this.createAiApiHandle(runtime);
    context.setProp(executionContextHandle, "ai", aiHandle);
    aiHandle.dispose();

    const storageHandle = this.createStorageApiHandle(runtime);
    context.setProp(executionContextHandle, "storage", storageHandle);
    storageHandle.dispose();

    const networkHandle = this.createNetworkApiHandle(runtime);
    context.setProp(executionContextHandle, "network", networkHandle);
    networkHandle.dispose();

    const filesystemHandle = this.createFilesystemApiHandle(runtime);
    context.setProp(executionContextHandle, "fs", filesystemHandle);
    filesystemHandle.dispose();

    const cliHandle = this.createCliApiHandle(runtime);
    context.setProp(executionContextHandle, "cli", cliHandle);
    cliHandle.dispose();

    return executionContextHandle;
  }

  private createLoggerHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const loggerHandle = context.newObject();

    const createLogMethod = (
      level: "debug" | "info" | "warn" | "error",
    ): QuickJSHandle =>
      context.newFunction(level, (messageHandle, metadataHandle) => {
        const message = this.readHandleAsString(context, messageHandle);
        const metadata =
          context.typeof(metadataHandle) === "undefined"
            ? undefined
            : context.dump(metadataHandle);
        const prefix = `[extension:${runtime.extension.manifest.id}]`;
        if (level === "debug") {
          console.debug(prefix, message, metadata ?? "");
          return;
        }
        if (level === "info") {
          console.info(prefix, message, metadata ?? "");
          return;
        }
        if (level === "warn") {
          console.warn(prefix, message, metadata ?? "");
          return;
        }
        console.error(prefix, message, metadata ?? "");
      });

    const debugHandle = createLogMethod("debug");
    context.setProp(loggerHandle, "debug", debugHandle);
    debugHandle.dispose();

    const infoHandle = createLogMethod("info");
    context.setProp(loggerHandle, "info", infoHandle);
    infoHandle.dispose();

    const warnHandle = createLogMethod("warn");
    context.setProp(loggerHandle, "warn", warnHandle);
    warnHandle.dispose();

    const errorHandle = createLogMethod("error");
    context.setProp(loggerHandle, "error", errorHandle);
    errorHandle.dispose();

    return loggerHandle;
  }

  private createNotesApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const notesHandle = context.newObject();

    const listHandle = context.newAsyncifiedFunction("list", async () =>
      this.toQuickJSHandle(context, await listNotes()),
    );
    context.setProp(notesHandle, "list", listHandle);
    listHandle.dispose();

    const readHandle = context.newAsyncifiedFunction("read", async (noteIdHandle) =>
      this.toQuickJSHandle(
        context,
        await readNote(this.readHandleAsString(context, noteIdHandle)),
      ),
    );
    context.setProp(notesHandle, "read", readHandle);
    readHandle.dispose();

    const createHandle = context.newAsyncifiedFunction(
      "create",
      async (inputHandle) => {
        const input = this.dumpAsRecord(context, inputHandle, "notes.create input");
        const title = readRequiredRecordString(input, "title");
        const markdown = readRequiredRecordString(input, "markdown");
        return this.toQuickJSHandle(
          context,
          await saveNote({
            title,
            markdown,
          }),
        );
      },
    );
    context.setProp(notesHandle, "create", createHandle);
    createHandle.dispose();

    const updateHandle = context.newAsyncifiedFunction(
      "update",
      async (noteIdHandle, inputHandle) => {
        const noteId = this.readHandleAsString(context, noteIdHandle, "noteId");
        const existing = await readNote(noteId);
        const input = this.dumpAsRecord(context, inputHandle, "notes.update input");
        const title = readOptionalRecordString(input, "title") ?? existing.title;
        const markdown =
          readOptionalRecordString(input, "markdown") ?? existing.markdown;

        return this.toQuickJSHandle(
          context,
          await saveNote({
            id: noteId,
            title,
            markdown,
          }),
        );
      },
    );
    context.setProp(notesHandle, "update", updateHandle);
    updateHandle.dispose();

    const getActiveEditorHandle = context.newAsyncifiedFunction(
      "getActiveEditor",
      async () => {
        return this.createActiveEditorApiHandle(runtime);
      },
    );
    context.setProp(notesHandle, "getActiveEditor", getActiveEditorHandle);
    getActiveEditorHandle.dispose();

    return notesHandle;
  }

  private createActiveEditorApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const activeEditorHandle = context.newObject();

    const selectionHandle = context.newAsyncifiedFunction(
      "getSelectionAsMarkdown",
      async () => {
        runtime.gate.require(
          "notes.read",
          "ctx.notes.getActiveEditor().getSelectionAsMarkdown",
        );
        const getSelectionAsMarkdown = this.options.getActiveEditorSelectionAsMarkdown;
        if (!getSelectionAsMarkdown) {
          throw new Error("No active editor bridge is available.");
        }
        return context.newString(await getSelectionAsMarkdown());
      },
    );
    context.setProp(activeEditorHandle, "getSelectionAsMarkdown", selectionHandle);
    selectionHandle.dispose();

    const insertAtCursorHandle = context.newAsyncifiedFunction(
      "insertAtCursor",
      async (markdownHandle) => {
        runtime.gate.require(
          "notes.write",
          "ctx.notes.getActiveEditor().insertAtCursor",
        );
        const insertAtActiveEditorCursor = this.options.insertAtActiveEditorCursor;
        if (!insertAtActiveEditorCursor) {
          throw new Error("No active editor bridge is available.");
        }
        await insertAtActiveEditorCursor(
          this.readHandleAsString(context, markdownHandle, "markdown"),
        );
      },
    );
    context.setProp(activeEditorHandle, "insertAtCursor", insertAtCursorHandle);
    insertAtCursorHandle.dispose();

    return activeEditorHandle;
  }

  private createWorkspaceApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const workspaceHandle = context.newObject();
    const rootHandle = context.newAsyncifiedFunction(
      "root",
      async () =>
        this.toQuickJSHandle(context, getWorkspaceRoot() ?? null),
    );
    context.setProp(workspaceHandle, "root", rootHandle);
    rootHandle.dispose();
    return workspaceHandle;
  }

  private createAiApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const aiHandle = context.newObject();

    const listProvidersHandle = context.newAsyncifiedFunction(
      "listProviders",
      async () => {
        const providers = listAllProviders(
          this.extensionRegistry.list(),
          this.listContributedAIProviders(),
        );
        return this.toQuickJSHandle(context, providers);
      },
    );
    context.setProp(aiHandle, "listProviders", listProvidersHandle);
    listProvidersHandle.dispose();

    const chatHandle = context.newAsyncifiedFunction("chat", async (inputHandle) => {
      runtime.gate.require("ai.provider", "ctx.ai.chat");
      const input = this.dumpAsRecord(context, inputHandle, "ai.chat input");
      const providerId = readOptionalRecordString(input, "providerId");
      if (providerId) {
        this.assertProviderAllowed(runtime, providerId, "ctx.ai.chat");
      }
      throw new Error("ctx.ai.chat is not implemented yet.");
    });
    context.setProp(aiHandle, "chat", chatHandle);
    chatHandle.dispose();

    const summarizeHandle = context.newAsyncifiedFunction(
      "summarize",
      async () => {
        runtime.gate.require("ai.provider", "ctx.ai.summarize");
        throw new Error("ctx.ai.summarize is not implemented yet.");
      },
    );
    context.setProp(aiHandle, "summarize", summarizeHandle);
    summarizeHandle.dispose();

    const embedHandle = context.newAsyncifiedFunction("embed", async () => {
      runtime.gate.require("ai.provider", "ctx.ai.embed");
      throw new Error("ctx.ai.embed is not implemented yet.");
    });
    context.setProp(aiHandle, "embed", embedHandle);
    embedHandle.dispose();

    return aiHandle;
  }

  private createStorageApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const storageHandle = context.newObject();

    const getHandle = context.newAsyncifiedFunction("get", async (keyHandle) => {
      const key = this.readHandleAsString(context, keyHandle, "storage key");
      return this.toQuickJSHandle(
        context,
        runtime.storage.has(key) ? runtime.storage.get(key) : null,
      );
    });
    context.setProp(storageHandle, "get", getHandle);
    getHandle.dispose();

    const setHandle = context.newAsyncifiedFunction(
      "set",
      async (keyHandle, valueHandle) => {
        const key = this.readHandleAsString(context, keyHandle, "storage key");
        runtime.storage.set(key, context.dump(valueHandle));
      },
    );
    context.setProp(storageHandle, "set", setHandle);
    setHandle.dispose();

    const deleteHandle = context.newAsyncifiedFunction(
      "delete",
      async (keyHandle) => {
        const key = this.readHandleAsString(context, keyHandle, "storage key");
        runtime.storage.delete(key);
      },
    );
    context.setProp(storageHandle, "delete", deleteHandle);
    deleteHandle.dispose();

    return storageHandle;
  }

  private createNetworkApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const networkHandle = context.newObject();

    const fetchHandle = context.newAsyncifiedFunction(
      "fetch",
      async (inputHandle, initHandle) => {
        runtime.gate.require("network", "ctx.network.fetch");
        const input = this.readHandleAsString(context, inputHandle, "network input");
        const init =
          context.typeof(initHandle) === "undefined"
            ? undefined
            : this.dumpAsRecord(context, initHandle, "network init");
        this.assertNetworkAllowed(runtime, input, "ctx.network.fetch");

        const response = await fetch(input, {
          method: readOptionalRecordString(init, "method"),
          body: readOptionalRecordString(init, "body"),
          headers: readOptionalRecordStringMap(init, "headers"),
        });
        const bodyBuffer = await response.arrayBuffer();
        if (bodyBuffer.byteLength > MAX_NETWORK_RESPONSE_BYTES) {
          throw new Error(
            `Network response exceeded ${MAX_NETWORK_RESPONSE_BYTES} bytes.`,
          );
        }
        const bodyText = new TextDecoder().decode(bodyBuffer);
        return this.createFetchResponseHandle(context, response, bodyText);
      },
    );
    context.setProp(networkHandle, "fetch", fetchHandle);
    fetchHandle.dispose();

    return networkHandle;
  }

  private createFetchResponseHandle(
    context: QuickJSAsyncContext,
    response: Response,
    bodyText: string,
  ): QuickJSHandle {
    const responseHandle = context.newObject();

    const statusHandle = context.newNumber(response.status);
    context.setProp(responseHandle, "status", statusHandle);
    statusHandle.dispose();

    const headersHandle = this.toQuickJSHandle(
      context,
      Object.fromEntries(response.headers.entries()),
    );
    context.setProp(responseHandle, "headers", headersHandle);
    headersHandle.dispose();

    const textHandle = context.newFunction("text", () => context.newString(bodyText));
    context.setProp(responseHandle, "text", textHandle);
    textHandle.dispose();

    const jsonHandle = context.newFunction("json", () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new Error("Response body is not valid JSON.");
      }
      return this.toQuickJSHandle(context, parsed);
    });
    context.setProp(responseHandle, "json", jsonHandle);
    jsonHandle.dispose();

    return responseHandle;
  }

  private createFilesystemApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const filesystemHandle = context.newObject();

    const readFileHandle = context.newAsyncifiedFunction(
      "readFile",
      async (pathHandle) => {
        runtime.gate.require("filesystem.read", "ctx.fs.readFile");
        const requestedPath = this.readHandleAsString(
          context,
          pathHandle,
          "filesystem path",
        );
        const resolvedPath = await this.resolveFilesystemPath(
          runtime,
          requestedPath,
          "read",
        );
        return context.newString(await readFile(resolvedPath, "utf8"));
      },
    );
    context.setProp(filesystemHandle, "readFile", readFileHandle);
    readFileHandle.dispose();

    const writeFileHandle = context.newAsyncifiedFunction(
      "writeFile",
      async (pathHandle, contentHandle) => {
        runtime.gate.require("filesystem.write", "ctx.fs.writeFile");
        const requestedPath = this.readHandleAsString(
          context,
          pathHandle,
          "filesystem path",
        );
        const content = this.readHandleAsString(
          context,
          contentHandle,
          "filesystem content",
        );
        const resolvedPath = await this.resolveFilesystemPath(
          runtime,
          requestedPath,
          "write",
        );
        await mkdir(dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, content, "utf8");
      },
    );
    context.setProp(filesystemHandle, "writeFile", writeFileHandle);
    writeFileHandle.dispose();

    return filesystemHandle;
  }

  private createCliApiHandle(runtime: ActiveExtensionRuntime): QuickJSHandle {
    const context = runtime.context;
    const cliHandle = context.newObject();

    const execHandle = context.newAsyncifiedFunction(
      "exec",
      async (commandHandle, argsHandle) => {
        runtime.gate.require("cli.exec", "ctx.cli.exec");
        const command = this.readHandleAsString(context, commandHandle, "command");
        this.assertCliCommandAllowed(runtime, command, "ctx.cli.exec");
        const args = this.readCliArgs(context, argsHandle);

        const process = Bun.spawn({
          cmd: [command, ...args],
          stdout: "pipe",
          stderr: "pipe",
        });
        const [exitCode, stdout, stderr] = await Promise.all([
          process.exited,
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
        ]);

        if (stdout.length > MAX_COMMAND_OUTPUT_BYTES) {
          throw new Error(
            `Command stdout exceeded ${MAX_COMMAND_OUTPUT_BYTES} bytes.`,
          );
        }
        if (stderr.length > MAX_COMMAND_OUTPUT_BYTES) {
          throw new Error(
            `Command stderr exceeded ${MAX_COMMAND_OUTPUT_BYTES} bytes.`,
          );
        }

        return this.toQuickJSHandle(context, {
          exitCode,
          stdout,
          stderr,
        });
      },
    );
    context.setProp(cliHandle, "exec", execHandle);
    execHandle.dispose();

    return cliHandle;
  }

  private readCliArgs(
    context: QuickJSAsyncContext,
    argsHandle: QuickJSHandle,
  ): string[] {
    if (context.typeof(argsHandle) === "undefined") {
      return [];
    }
    const dumped = context.dump(argsHandle);
    if (!Array.isArray(dumped) || dumped.some((arg) => typeof arg !== "string")) {
      throw new Error("CLI args must be an array of strings.");
    }
    return dumped;
  }

  private findCommandRegistration(commandId: string): {
    runtime: ActiveExtensionRuntime;
    command: RegisteredCommand;
  } | null {
    for (const runtime of this.activeRuntimes.values()) {
      const command = runtime.commands.get(commandId);
      if (command) {
        return { runtime, command };
      }
    }
    return null;
  }

  private findToolRegistration(toolId: string): {
    runtime: ActiveExtensionRuntime;
    tool: RegisteredTool;
  } | null {
    for (const runtime of this.activeRuntimes.values()) {
      const tool = runtime.tools.get(toolId);
      if (tool) {
        return { runtime, tool };
      }
    }
    return null;
  }

  private findInlineEditorBlockRegistration(blockId: string): {
    runtime: ActiveExtensionRuntime;
    block: RegisteredInlineEditorBlock;
  } | null {
    for (const runtime of this.activeRuntimes.values()) {
      const block = runtime.inlineEditorBlocks.get(blockId);
      if (block) {
        return { runtime, block };
      }
    }
    return null;
  }

  private findFilePreviewHandlerRegistration(path: string): {
    runtime: ActiveExtensionRuntime;
    handler: RegisteredFilePreviewHandler;
  } | null {
    const fileExtension = extname(path).toLowerCase();
    if (!fileExtension) {
      return null;
    }
    for (const runtime of this.activeRuntimes.values()) {
      for (const handler of runtime.filePreviewHandlers.values()) {
        if (handler.fileExtensions.includes(fileExtension)) {
          return { runtime, handler };
        }
      }
    }
    return null;
  }

  private normalizeInlineEditorBlockResult(
    value: unknown,
  ): ExtensionInlineEditorBlockResult {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Inline editor block handler must return an object.");
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.markdown !== "string") {
      throw new Error('Inline editor block handler must return a string "markdown".');
    }
    if (candidate.markdown.length > MAX_INLINE_BLOCK_MARKDOWN_BYTES) {
      throw new Error(
        `Inline editor block markdown exceeded ${MAX_INLINE_BLOCK_MARKDOWN_BYTES} bytes.`,
      );
    }
    return { markdown: candidate.markdown };
  }

  private normalizeFilePreviewRenderResult(
    path: string,
    handler: RegisteredFilePreviewHandler,
    value: unknown,
  ): ExtensionResolvedFilePreview {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("File preview handler must return an object.");
    }
    const candidate = value as ExtensionFilePreviewRenderResult;
    if (typeof candidate.content !== "string") {
      throw new Error('File preview handler must return a string "content".');
    }
    if (candidate.content.length > MAX_FILE_PREVIEW_CONTENT_BYTES) {
      throw new Error(
        `File preview content exceeded ${MAX_FILE_PREVIEW_CONTENT_BYTES} bytes.`,
      );
    }
    const contentType = resolvePreviewContentType(candidate.contentType);
    const fallbackTitle = basename(path);
    const title =
      typeof candidate.title === "string" && candidate.title.trim().length > 0
        ? candidate.title
        : fallbackTitle;
    return {
      handlerId: handler.id,
      handlerTitle: handler.title,
      path,
      title,
      contentType,
      content: candidate.content,
    };
  }

  private async callExtensionFunction(
    context: QuickJSAsyncContext,
    functionHandle: QuickJSHandle,
    thisHandle: QuickJSHandle,
    args: QuickJSHandle[],
  ): Promise<QuickJSHandle> {
    const callResult = context.callFunction(functionHandle, thisHandle, ...args);
    const callValueHandle = context.unwrapResult(callResult);
    return this.resolveMaybePromiseHandle(context, callValueHandle);
  }

  private async resolveMaybePromiseHandle(
    context: QuickJSAsyncContext,
    handle: QuickJSHandle,
  ): Promise<QuickJSHandle> {
    const promiseState = context.getPromiseState(handle);
    if (promiseState.type === "fulfilled" && promiseState.notAPromise) {
      return handle;
    }
    const resolved = await context.resolvePromise(handle);
    handle.dispose();
    return context.unwrapResult(resolved);
  }

  private readHandleAsString(
    context: QuickJSAsyncContext,
    handle: QuickJSHandle,
    label = "value",
  ): string {
    if (context.typeof(handle) !== "string") {
      throw new Error(`Expected ${label} to be a string.`);
    }
    return context.getString(handle);
  }

  private toQuickJSHandle(
    context: QuickJSAsyncContext,
    value: unknown,
  ): QuickJSHandle {
    if (value === undefined) {
      return context.undefined.dup();
    }
    if (value === null) {
      return context.null.dup();
    }
    if (typeof value === "string") {
      return context.newString(value);
    }
    if (typeof value === "number") {
      return context.newNumber(value);
    }
    if (typeof value === "boolean") {
      return (value ? context.true : context.false).dup();
    }
    if (Array.isArray(value)) {
      const arrayHandle = context.newArray();
      for (const [index, item] of value.entries()) {
        const itemHandle = this.toQuickJSHandle(context, item);
        context.setProp(arrayHandle, String(index), itemHandle);
        itemHandle.dispose();
      }
      return arrayHandle;
    }
    if (typeof value === "object") {
      const objectHandle = context.newObject();
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const itemHandle = this.toQuickJSHandle(context, item);
        context.setProp(objectHandle, key, itemHandle);
        itemHandle.dispose();
      }
      return objectHandle;
    }

    return context.newString(String(value));
  }

  private dumpAsRecord(
    context: QuickJSAsyncContext,
    handle: QuickJSHandle,
    label: string,
  ): Record<string, unknown> {
    const dumped = context.dump(handle);
    if (!dumped || typeof dumped !== "object" || Array.isArray(dumped)) {
      throw new Error(`${label} must be an object.`);
    }
    return dumped as Record<string, unknown>;
  }

  private assertNetworkAllowed(
    runtime: ActiveExtensionRuntime,
    urlValue: string,
    contextLabel: string,
  ): void {
    const url = new URL(urlValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${contextLabel} only supports http/https URLs.`);
    }

    const allowlist = runtime.gate.getNetworkAllowlist();
    if (allowlist.length === 0) {
      throw new Error("No network allowlist is configured for this extension.");
    }

    const port = url.port.length > 0 ? Number(url.port) : defaultPortForProtocol(url.protocol);
    const host = url.hostname.toLowerCase();
    const allowed = allowlist.some((entry) => matchesNetworkAllowlist(entry, host, port));
    if (!allowed) {
      throw new Error(`Host "${host}" is not allowed by network allowlist.`);
    }
  }

  private assertCliCommandAllowed(
    runtime: ActiveExtensionRuntime,
    command: string,
    contextLabel: string,
  ): void {
    const allowedCommands = runtime.gate.getAllowedCliCommands();
    if (!allowedCommands.includes(command)) {
      throw new Error(`Command "${command}" is not allowed for ${contextLabel}.`);
    }
  }

  private assertProviderAllowed(
    runtime: ActiveExtensionRuntime,
    providerId: string,
    contextLabel: string,
  ): void {
    const allowedProviderIds = runtime.gate.getAllowedAIProviderIds();
    if (!allowedProviderIds.includes(providerId)) {
      throw new Error(`Provider "${providerId}" is not allowed for ${contextLabel}.`);
    }
  }

  private async resolveFilesystemPath(
    runtime: ActiveExtensionRuntime,
    requestedPath: string,
    mode: "read" | "write",
  ): Promise<string> {
    const roots = runtime.gate.getFilesystemRoots(mode);
    if (roots.length === 0) {
      throw new Error(`No filesystem roots were granted for ${mode} access.`);
    }

    const workspaceRoot = getWorkspaceRoot();
    const absoluteCandidate = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : workspaceRoot
        ? resolve(workspaceRoot, requestedPath)
        : resolve(runtime.extension.rootDir, requestedPath);

    const candidateForCheck =
      mode === "read"
        ? await realpath(absoluteCandidate)
        : await this.resolvePathForWriteCheck(absoluteCandidate);

    const resolvedRoots = await Promise.all(
      roots.map((root) =>
        this.resolvePermissionRoot(runtime, root, workspaceRoot, mode),
      ),
    );

    const allowed = resolvedRoots.some((root) =>
      isWithinPathBoundary(candidateForCheck, root),
    );
    if (!allowed) {
      throw new Error(
        `Path "${requestedPath}" is outside of allowed filesystem roots for ${mode} access.`,
      );
    }

    return absoluteCandidate;
  }

  private async resolvePermissionRoot(
    runtime: ActiveExtensionRuntime,
    root: string,
    workspaceRoot: string | null,
    mode: "read" | "write",
  ): Promise<string> {
    if (root === "$workspace") {
      if (!workspaceRoot) {
        throw new Error(
          `Permission root "$workspace" requires an open workspace for ${mode} access.`,
        );
      }
      try {
        return await realpath(workspaceRoot);
      } catch {
        return normalize(resolve(workspaceRoot));
      }
    }

    const absoluteRoot = isAbsolute(root)
      ? resolve(root)
      : resolve(runtime.extension.rootDir, root);
    try {
      return await realpath(absoluteRoot);
    } catch {
      return normalize(absoluteRoot);
    }
  }

  private async resolvePathForWriteCheck(pathToWrite: string): Promise<string> {
    const absolutePath = resolve(pathToWrite);
    const parentPath = dirname(absolutePath);
    try {
      const canonicalParent = await realpath(parentPath);
      return normalize(join(canonicalParent, absolutePath.slice(parentPath.length + 1)));
    } catch {
      return normalize(absolutePath);
    }
  }

  private broadcastEvent(event: ExtensionRuntimeEvent, data?: unknown): void {
    for (const runtime of this.activeRuntimes.values()) {
      const handlers = runtime.eventHandlers.get(event);
      if (!handlers || handlers.length === 0) {
        continue;
      }

      const payload = {
        timestamp: new Date().toISOString(),
        event,
        data,
      };
      void this.invokeEventHandlers(runtime, handlers, payload);
    }
  }

  private async invokeEventHandlers(
    runtime: ActiveExtensionRuntime,
    handlers: QuickJSHandle[],
    payload: unknown,
  ): Promise<void> {
    const context = runtime.context;
    const payloadHandle = this.toQuickJSHandle(context, payload);
    const executionContextHandle = this.createExecutionContextHandle(runtime);
    try {
      for (const handler of handlers) {
        const resultHandle = await this.callExtensionFunction(
          context,
          handler,
          context.undefined,
          [payloadHandle, executionContextHandle],
        );
        resultHandle.dispose();
      }
    } catch (error: unknown) {
      console.error(
        `[extensions] event hook failed for ${runtime.extension.manifest.id}`,
        error,
      );
    } finally {
      payloadHandle.dispose();
      executionContextHandle.dispose();
    }
  }

  private async loadRuntimeStorage(
    extension: InstalledExtension,
  ): Promise<Map<string, unknown>> {
    const storagePath = join(extension.rootDir, ".karabiner-runtime", RUNTIME_STORAGE_FILENAME);
    try {
      const content = await readFile(storagePath, "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return new Map(Object.entries(parsed));
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return new Map();
      }
      throw error;
    }
  }

  private async persistRuntimeStorage(runtime: ActiveExtensionRuntime): Promise<void> {
    const runtimeDirectory = join(runtime.extension.rootDir, ".karabiner-runtime");
    await mkdir(runtimeDirectory, { recursive: true });
    const storagePath = join(runtimeDirectory, RUNTIME_STORAGE_FILENAME);
    await writeFile(
      storagePath,
      JSON.stringify(Object.fromEntries(runtime.storage.entries()), null, 2),
      "utf8",
    );
  }
}

function isAIProviderDefinition(value: unknown): value is AIProviderDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.displayName !== "string" ||
    (candidate.kind !== "remote" &&
      candidate.kind !== "local" &&
      candidate.kind !== "cli") ||
    !Array.isArray(candidate.capabilities)
  ) {
    return false;
  }
  return candidate.capabilities.every(
    (capability) =>
      capability === "chat" ||
      capability === "embeddings" ||
      capability === "tool-use" ||
      capability === "vision" ||
      capability === "streaming",
  );
}

function normalizeFileExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 2 ||
    !normalized.startsWith(".") ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new Error(
      `Invalid file extension "${value}". Expected values like ".tldraw".`,
    );
  }
  return normalized;
}

function resolvePreviewContentType(
  value: unknown,
): ExtensionResolvedFilePreview["contentType"] {
  if (value === undefined || value === "text") {
    return "text";
  }
  if (value === "markdown" || value === "json" || value === "tldraw") {
    return value;
  }
  throw new Error(
    'File preview contentType must be "text", "markdown", "json", or "tldraw".',
  );
}

function readRequiredRecordString(
  value: Record<string, unknown>,
  key: string,
): string {
  const candidate = value[key];
  if (typeof candidate !== "string") {
    throw new Error(`Expected "${key}" to be a string.`);
  }
  return candidate;
}

function readOptionalRecordString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== "string") {
    throw new Error(`Expected "${key}" to be a string.`);
  }
  return candidate;
}

function readOptionalRecordStringMap(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`Expected "${key}" to be an object of string values.`);
  }
  const entries = Object.entries(candidate);
  const headers: Record<string, string> = {};
  for (const [entryKey, entryValue] of entries) {
    if (typeof entryValue !== "string") {
      throw new Error(`Expected header "${entryKey}" to be a string value.`);
    }
    headers[entryKey] = entryValue;
  }
  return headers;
}

function defaultPortForProtocol(protocol: string): number {
  if (protocol === "https:") {
    return 443;
  }
  return 80;
}

function matchesNetworkAllowlist(
  entry: string,
  host: string,
  port: number,
): boolean {
  const normalizedEntry = entry.trim().toLowerCase();
  if (normalizedEntry.length === 0) {
    return false;
  }

  const [entryHost, entryPort] = normalizedEntry.split(":");
  if (entryPort && Number(entryPort) !== port) {
    return false;
  }

  if (entryHost.startsWith("*.")) {
    const suffix = entryHost.slice(1);
    return host.endsWith(suffix);
  }
  return host === entryHost;
}

function isWithinPathBoundary(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  if (normalizedCandidate === normalizedRoot) {
    return true;
  }
  return normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function isNotFoundError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}
