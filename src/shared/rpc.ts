import { RPCSchema } from "electrobun/bun";
import type { AIProviderDefinition } from "./contracts/ai";
import type { CorePerformanceBudget } from "./contracts/app";
import type {
  ImageAsset,
  NoteDocument,
  NoteSummary,
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
      listWorkspaceItems: {
        params: Record<string, never>;
        response: WorkspaceItem[];
      };
      readImageAsset: {
        params: { path: string };
        response: ImageAsset;
      };
    };
    messages: {
      log: { message: string };
      requestOpenWorkspaceFolder: Record<string, never>;
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      notify: { text: string };
      workspaceFolderSelected: { path: string | null };
    };
  }>;
};
