import { BrowserView, BrowserWindow, ApplicationMenu } from "electrobun/bun";
import type { AppRPC } from "../shared/rpc";

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      getAppInfo: () => ({
        name: "Karabiner",
        version: "0.1.0",
      }),
    },
    messages: {
      log: ({ message }) => console.log("[webview]", message),
    },
  },
});

export const win = new BrowserWindow({
  title: "Karabiner",
  url: "views://mainview/index.html",
  frame: { x: 100, y: 100, width: 1024, height: 768 },
  rpc,
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
