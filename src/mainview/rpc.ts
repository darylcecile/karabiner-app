import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc";

const workspaceFolderListeners = new Set<(path: string | null) => void>();
type ActiveEditorBridge = {
  getSelectionAsMarkdown(): Promise<string> | string;
  insertAtCursor(markdown: string): Promise<void> | void;
};

let activeEditorBridge: ActiveEditorBridge | null = null;

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getActiveEditorSelectionAsMarkdown: async () => {
        if (!activeEditorBridge) {
          throw new Error("No active editor is currently registered.");
        }
        return {
          markdown: await activeEditorBridge.getSelectionAsMarkdown(),
        };
      },
      insertAtActiveEditorCursor: async ({ markdown }) => {
        if (!activeEditorBridge) {
          throw new Error("No active editor is currently registered.");
        }
        await activeEditorBridge.insertAtCursor(markdown);
        return { ok: true as const };
      },
    },
    messages: {
      notify: ({ text }) => {
        console.log("[notify]", text);
      },
      workspaceFolderSelected: ({ path }) => {
        for (const listener of workspaceFolderListeners) {
          listener(path);
        }
      },
    },
  },
});

export const electroview = new Electroview({ rpc });

export function onWorkspaceFolderSelected(
  listener: (path: string | null) => void,
): () => void {
  workspaceFolderListeners.add(listener);
  return () => {
    workspaceFolderListeners.delete(listener);
  };
}

export function registerActiveEditorBridge(
  bridge: ActiveEditorBridge,
): () => void {
  activeEditorBridge = bridge;
  return () => {
    if (activeEditorBridge === bridge) {
      activeEditorBridge = null;
    }
  };
}
