import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc";

const workspaceFolderListeners = new Set<(path: string | null) => void>();

const rpc = Electroview.defineRPC<AppRPC>({
  handlers: {
    requests: {},
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
