import { BrowserView, BrowserWindow, ApplicationMenu, Utils } from "electrobun/bun";
import type { AppRPC } from "../shared/rpc";
import { DEFAULT_PERFORMANCE_BUDGET } from "../shared/contracts/app";
import { EXTENSION_MANIFEST_VERSION } from "../shared/contracts/extensions";
import { EXTENSION_PERMISSION_IDS } from "../shared/contracts/permissions";
import { listAllProviders } from "./ai/providers";
import { initializeDataLayer } from "./data/client";
import { ExtensionRegistry } from "./extensions/registry";
import {
  listOfficialExtensions,
  readOfficialExtension,
} from "./extensions/official/extensions";
import { ExtensionRuntimeHost } from "./extensions/runtime/host";
import {
  getWorkspaceRoot,
  listNotes,
  listWorkspaceItems,
  readImageAsset,
  readNote,
  restoreWorkspaceRoot,
  saveNote,
  setWorkspaceRoot,
} from "./notes/storage";

const dataLayerReady = initializeDataLayer();
const extensionRegistry = new ExtensionRegistry();
let extensionRuntimeHost: ExtensionRuntimeHost | null = null;
let extensionRuntimeReady: Promise<void> = Promise.resolve();
const workspaceRestoreReady = restoreWorkspaceRoot().catch((error: unknown) => {
  console.error("[bun] failed to restore previous workspace root", error);
  return null;
});

async function promptWorkspaceFolderSelection(): Promise<string | null> {
  const selectedPaths = await Utils.openFileDialog({
    startingFolder: Utils.paths.documents,
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  });
  const selectedPath = selectedPaths.find((value) => value.length > 0) ?? null;
  if (!selectedPath) {
    return null;
  }

  await setWorkspaceRoot(selectedPath);
  return selectedPath;
}

void dataLayerReady
  .then((status) => {
    console.log(
      "[bun] data layer ready",
      status.databasePath,
      status.appliedMigrations.length,
      "new migrations",
    );
  })
  .catch((error: unknown) => {
    console.error("[bun] failed to initialize data layer", error);
    throw error;
  });

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      getAppInfo: () => ({
        name: "Karabiner",
        version: "0.1.0",
      }),
      getCoreArchitecture: () => ({
        extensionManifestVersion: EXTENSION_MANIFEST_VERSION,
        performanceBudget: DEFAULT_PERFORMANCE_BUDGET,
        permissionIds: [...EXTENSION_PERMISSION_IDS],
      }),
      getDataLayerStatus: async () => dataLayerReady,
      getWorkspaceRoot: async () => {
        await workspaceRestoreReady;
        return { path: getWorkspaceRoot() };
      },
      listNotes,
      listWorkspaceItems,
      readNote: ({ id }) => readNote(id),
      readImageAsset: ({ path }) => readImageAsset(path),
      saveNote: (params) => saveNote(params),
      listAIProviders: async () => {
        await extensionRuntimeReady;
        return listAllProviders(
          extensionRegistry.list(),
          extensionRuntimeHost?.listContributedAIProviders() ?? [],
        );
      },
      listOfficialExtensions: async () => {
        await extensionRuntimeReady;
        const installedIds = new Set(
          extensionRegistry.list().map((extension) => extension.manifest.id),
        );
        return listOfficialExtensions().map((extension) => ({
          ...extension,
          installed: installedIds.has(extension.id),
        }));
      },
      readOfficialExtensionReadme: async ({ id }) => {
        await extensionRuntimeReady;
        const extension = readOfficialExtension(id);
        const installed =
          extensionRuntimeHost?.hasInstalledExtension(id) ??
          (extensionRegistry.getById(id) !== undefined);
        return {
          ...extension,
          installed,
        };
      },
      installOfficialExtension: async ({ id }) => {
        await extensionRuntimeReady;
        if (!extensionRuntimeHost) {
          throw new Error("Extension runtime host is unavailable.");
        }
        await extensionRuntimeHost.installOfficialExtension(id);
        const extension = readOfficialExtension(id);
        return {
          ...extension,
          installed: true,
        };
      },
      listExtensionInlineEditorBlocks: async () => {
        await extensionRuntimeReady;
        return extensionRuntimeHost?.listContributedInlineEditorBlocks() ?? [];
      },
      invokeExtensionInlineEditorBlock: async ({ blockId }) => {
        await extensionRuntimeReady;
        if (!extensionRuntimeHost) {
          throw new Error("Extension runtime host is unavailable.");
        }
        return extensionRuntimeHost.invokeInlineEditorBlock(blockId);
      },
      renderExtensionFilePreview: async ({ path }) => {
        await extensionRuntimeReady;
        if (!extensionRuntimeHost) {
          return null;
        }
        return extensionRuntimeHost.renderFilePreview(path);
      },
    },
    messages: {
      log: ({ message }) => console.log("[webview]", message),
      requestOpenWorkspaceFolder: async () => {
        try {
          const selectedPath = await promptWorkspaceFolderSelection();
          win.webview.rpc?.send.workspaceFolderSelected({ path: selectedPath });
        } catch (error: unknown) {
          console.error("[bun] failed to pick workspace folder", error);
          win.webview.rpc?.send.workspaceFolderSelected({ path: null });
        }
      },
    },
  },
});

export const win = new BrowserWindow({
  title: "Karabiner",
  url: "views://mainview/index.html",
  frame: { x: 100, y: 100, width: 1024, height: 768 },
  rpc,
});

extensionRuntimeHost = new ExtensionRuntimeHost(extensionRegistry, {
  getActiveEditorSelectionAsMarkdown: async () => {
    const webviewRpc = win.webview.rpc;
    if (!webviewRpc?.request.getActiveEditorSelectionAsMarkdown) {
      throw new Error("Webview editor bridge is unavailable.");
    }
    const response = await webviewRpc.request.getActiveEditorSelectionAsMarkdown({});
    return response.markdown;
  },
  insertAtActiveEditorCursor: async (markdown) => {
    const webviewRpc = win.webview.rpc;
    if (!webviewRpc?.request.insertAtActiveEditorCursor) {
      throw new Error("Webview editor bridge is unavailable.");
    }
    await webviewRpc.request.insertAtActiveEditorCursor({ markdown });
  },
});
extensionRuntimeReady = extensionRuntimeHost
  .initialize()
  .then(() => {
    console.log(
      "[bun] extension runtime ready",
      extensionRuntimeHost?.listContributedAIProviders().length ?? 0,
      "runtime provider(s)",
    );
  })
  .catch((error: unknown) => {
    console.error("[bun] extension runtime failed to initialize", error);
  });

ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit Karabiner", role: "quit" }],
  },
  {
    label: "File",
    submenu: [
      { label: "Quit", role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { label: "Toggle Full Screen", role: "toggleFullScreen" },
    ],
  },
]);

console.log("[bun] Karabiner started");
