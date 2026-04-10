import { RPCSchema } from "electrobun/bun";
import type { AIProviderDefinition } from "./contracts/ai";
import type { CorePerformanceBudget } from "./contracts/app";
import type {
  ExtensionInlineEditorBlockContribution,
  ExtensionInlineEditorBlockResult,
  OfficialExtensionInstallPlan,
  OfficialExtensionReadme,
  OfficialExtensionSummary,
  ExtensionResolvedFilePreview,
} from "./contracts/extensions";
import type {
  ImageAsset,
  NoteDocument,
  NoteSummary,
  WorkspaceMoveResult,
  WorkspacePathResult,
  WorkspaceTextFile,
  WorkspaceItem,
} from "./contracts/notes";
import type { ExtensionPermissionId } from "./contracts/permissions";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      getAppInfo: {
        params: Record<string, never>;
        response: { name: string; version: string };
      };
      getCoreArchitecture: {
        params: Record<string, never>;
        response: {
          extensionManifestVersion: number;
          performanceBudget: CorePerformanceBudget;
          permissionIds: ExtensionPermissionId[];
        };
      };
      getDataLayerStatus: {
        params: Record<string, never>;
        response: {
          databasePath: string;
          appliedMigrations: string[];
        };
      };
      getWorkspaceRoot: {
        params: Record<string, never>;
        response: { path: string | null };
      };
      listNotes: {
        params: Record<string, never>;
        response: NoteSummary[];
      };
      readNote: {
        params: { id: string };
        response: NoteDocument;
      };
      saveNote: {
        params: {
          id?: string;
          title: string;
          markdown: string;
        };
        response: NoteDocument;
      };
      listAIProviders: {
        params: Record<string, never>;
        response: AIProviderDefinition[];
      };
      listOfficialExtensions: {
        params: Record<string, never>;
        response: OfficialExtensionSummary[];
      };
      readOfficialExtensionReadme: {
        params: { id: string };
        response: OfficialExtensionReadme;
      };
      prepareOfficialExtensionInstall: {
        params: { id: string };
        response: OfficialExtensionInstallPlan;
      };
      installOfficialExtension: {
        params: { id: string; installToken: string };
        response: OfficialExtensionReadme;
      };
      uninstallOfficialExtension: {
        params: { id: string };
        response: OfficialExtensionReadme;
      };
      listExtensionInlineEditorBlocks: {
        params: Record<string, never>;
        response: ExtensionInlineEditorBlockContribution[];
      };
      invokeExtensionInlineEditorBlock: {
        params: { blockId: string };
        response: ExtensionInlineEditorBlockResult;
      };
      renderExtensionFilePreview: {
        params: { path: string };
        response: ExtensionResolvedFilePreview | null;
      };
      listWorkspaceItems: {
        params: Record<string, never>;
        response: WorkspaceItem[];
      };
      readImageAsset: {
        params: { path: string };
        response: ImageAsset;
      };
      readWorkspaceTextFile: {
        params: { path: string };
        response: WorkspaceTextFile;
      };
      saveWorkspaceTextFile: {
        params: { path: string; content: string };
        response: WorkspaceTextFile;
      };
      createWorkspaceTextFile: {
        params: { path: string; content?: string };
        response: WorkspaceTextFile;
      };
      createWorkspaceFolder: {
        params: { path: string };
        response: WorkspacePathResult;
      };
      moveWorkspaceItem: {
        params: { fromPath: string; toPath: string };
        response: WorkspaceMoveResult;
      };
      deleteWorkspaceItem: {
        params: { path: string };
        response: WorkspacePathResult;
      };
    };
    messages: {
      log: { message: string };
      requestOpenWorkspaceFolder: Record<string, never>;
    };
  }>;
  webview: RPCSchema<{
    requests: {
      getActiveEditorSelectionAsMarkdown: {
        params: Record<string, never>;
        response: { markdown: string };
      };
      insertAtActiveEditorCursor: {
        params: { markdown: string };
        response: { ok: true };
      };
    };
    messages: {
      notify: { text: string };
      workspaceFolderSelected: { path: string | null };
    };
  }>;
};
