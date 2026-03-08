---
name: electrobun
description: Electrobun desktop app framework for TypeScript — provides API reference, project structure, patterns, and guidance. Use when building, debugging, or modifying Electrobun apps. Electrobun is NOT Electron; do not use Electron patterns.
license: MIT
metadata:
  source: https://blackboard.sh/electrobun/llms.txt
  framework: electrobun
---

# Electrobun

> Ultra-fast, tiny desktop application framework for TypeScript

IMPORTANT: Electrobun is NOT Electron. While both create desktop apps, they have completely different architectures and APIs. Do not use Electron patterns or APIs when helping with Electrobun code.

Website: https://blackboard.sh/electrobun
GitHub: https://github.com/blackboardsh/electrobun
Discord: https://discord.gg/ueKE4tjaCE

## Key Differences from Electron

| Aspect | Electron | Electrobun |
|--------|----------|------------|
| Runtime | Node.js + Chromium | Bun + System WebView |
| Bundle Size | 150MB+ | ~14MB |
| Update Size | 100MB+ | ~14KB (binary diff) |
| Startup Time | 2-5s | <50ms |
| IPC | ipcMain/ipcRenderer | Typed RPC |
| WebView | Chrome webview tag (deprecated) | Custom electrobun-webview tag |

## Installation & Setup

```bash
# Create new project (templates: hello-world, photo-booth, interactive-playground, multitab-browser)
bunx electrobun init
bunx electrobun init photo-booth

# Install dependencies
bun install

# Run in development
bun start

# Build for distribution
bunx electrobun build
bunx electrobun build --env canary
bunx electrobun build --env stable

# Cross-compile for specific targets
bunx electrobun build --targets macos-arm64,macos-x64,win-x64,linux-x64,linux-arm64
```

## Project Structure

```
my-app/
├── src/
│   ├── bun/           # Main process (runs in Bun)
│   │   └── index.ts
│   ├── views/         # Browser views (HTML/CSS/JS)
│   │   └── mainview/
│   │       └── index.html
│   └── shared/        # Shared types (RPC schemas)
│       └── types.ts
├── icon.iconset/      # App icons (16x16 through 512x512 at 1x and 2x)
├── package.json
└── electrobun.config.ts
```

## Import Patterns

```typescript
// Main process (Bun) - use electrobun/bun
import Electrobun from "electrobun/bun";
import {
  BrowserWindow, BrowserView, Tray, ContextMenu, ApplicationMenu,
  Updater, Utils, GlobalShortcut, Screen, Session, BuildConfig, PATHS
} from "electrobun/bun";

// Browser context - use electrobun/view
import { Electroview } from "electrobun/view";
```

## Core APIs

### BrowserWindow

Create and control browser windows.

```typescript
import { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  title: "My App",
  url: "views://mainview/index.html",  // Use views:// for bundled content
  html: "<html>...</html>",            // Or load HTML string directly
  frame: { width: 1200, height: 800, x: 100, y: 100 },
  titleBarStyle: "default" | "hidden" | "hiddenInset",
  transparent: false,
  styleMask: { Titled: true, Closable: true, Resizable: true, Miniaturizable: true,
               Borderless: false, FullSizeContentView: false, FullScreen: false,
               UnifiedTitleAndToolbar: false, UtilityWindow: false },
  partition: "persist:main",  // Session isolation
  preload: "views://mainview/preload.js",
  rpc: myRpcHandler,  // Typed RPC
  sandbox: false,  // true disables RPC, events only (for untrusted content)
  renderer: "native" | "cef",  // Renderer engine (requires CEF bundled for "cef")
});

// Methods
win.setTitle("New Title");
win.close();
win.focus();
win.minimize(); win.unminimize(); win.isMinimized();
win.maximize(); win.unmaximize(); win.isMaximized();
win.setFullScreen(true); win.isFullScreen();
win.setAlwaysOnTop(true); win.isAlwaysOnTop();
win.setPosition(x, y);
win.setSize(width, height);
win.setFrame(x, y, width, height);
win.getFrame(); // { x, y, width, height }
win.getPosition(); // { x, y }
win.getSize(); // { width, height }

// Events (per-window close handlers fire before global handlers)
win.on("close", (e) => { /* e.data.id */ });
win.on("resize", (e) => { /* e.data: { id, x, y, width, height } */ });
win.on("move", (e) => { /* e.data: { id, x, y } */ });
win.on("focus", (e) => { /* e.data.id */ });

// Access default webview
win.webview.loadURL("https://example.com");
```

### BrowserView

Manage webviews within windows.

```typescript
import { BrowserView } from "electrobun/bun";

// Define typed RPC (supports "*" wildcard message handler)
const rpc = BrowserView.defineRPC<MyRPCType>({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      myBunFunction: ({ a, b }) => a + b,
    },
    messages: {
      "*": (messageName, payload) => { console.log("catch-all", messageName, payload); },
      logToBun: ({ msg }) => console.log(msg),
    },
  },
});

// Static methods
BrowserView.getAll();        // Get all BrowserViews
BrowserView.getById(id);     // Get by ID

// Call browser functions from Bun
const result = await win.webview.rpc.request.someWebviewFunction({ a: 1, b: 2 });
win.webview.rpc.send.sendMessage({ msg: "hello" });

// Built-in RPC: execute JS and get result back
const title = await win.webview.rpc.request.evaluateJavascriptWithResponse({
  script: "document.title"
});

// BrowserView methods
win.webview.loadURL("https://example.com");
win.webview.loadHTML("<html>...</html>");
win.webview.executeJavascript('document.title');

// Navigation rules (evaluated in native code, last matching rule wins)
win.webview.setNavigationRules([
  "^*",                        // Block all by default
  "*://trusted-site.com/*",    // Allow trusted site
  "^http://*",                 // Block non-HTTPS
]);

// Find in page
win.webview.findInPage("search text", { forward: true, matchCase: false });
win.webview.stopFindInPage();

// DevTools
win.webview.openDevTools();
win.webview.closeDevTools();
win.webview.toggleDevTools();

// Events
win.webview.on("will-navigate", (e) => {
  // e.data: { url, allowed } — allowed reflects navigation rules result
});
win.webview.on("did-navigate", (e) => { /* e.data.detail: url */ });
win.webview.on("did-navigate-in-page", (e) => {});
win.webview.on("did-commit-navigation", (e) => {});
win.webview.on("dom-ready", (e) => {});
win.webview.on("new-window-open", (e) => {
  // e.detail: { url, isCmdClick, modifierFlags?, targetDisposition?, userGesture? }
});

// Download events
win.webview.on("download-started", (e) => { /* e.detail: { filename, path } */ });
win.webview.on("download-progress", (e) => { /* e.detail: { progress } (0-100) */ });
win.webview.on("download-completed", (e) => { /* e.detail: { filename, path } */ });
win.webview.on("download-failed", (e) => { /* e.detail: { filename, path, error } */ });
```

### RPC (Remote Procedure Calls)

Typed bidirectional communication between Bun and browser.

```typescript
// src/shared/types.ts - Shared RPC type definition
import { RPCSchema } from "electrobun/bun";

export type MyRPCType = {
  bun: RPCSchema<{
    requests: {
      addNumbers: { params: { a: number; b: number }; response: number };
    };
    messages: {
      logToBun: { msg: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      getDocumentTitle: { params: {}; response: string };
    };
    messages: {
      showNotification: { text: string };
    };
  }>;
};
```

```typescript
// src/bun/index.ts - Bun side
import { BrowserView, BrowserWindow } from "electrobun/bun";
import type { MyRPCType } from "../shared/types";

const rpc = BrowserView.defineRPC<MyRPCType>({
  handlers: {
    requests: {
      addNumbers: ({ a, b }) => a + b,
    },
    messages: {
      logToBun: ({ msg }) => console.log("Browser says:", msg),
    },
  },
});

const win = new BrowserWindow({ url: "views://main/index.html", rpc });

// Call browser function
const title = await win.webview.rpc.request.getDocumentTitle({});
```

```typescript
// src/views/main/index.ts - Browser side
import { Electroview } from "electrobun/view";
import type { MyRPCType } from "../../shared/types";

const rpc = Electroview.defineRPC<MyRPCType>({
  handlers: {
    requests: {
      getDocumentTitle: () => document.title,
    },
    messages: {
      showNotification: ({ text }) => alert(text),
    },
  },
});

const electroview = new Electroview({ rpc });

// Call Bun function
const sum = await electroview.rpc.request.addNumbers({ a: 5, b: 3 });
electroview.rpc.send.logToBun({ msg: "Hello from browser" });
```

### Electrobun Webview Tag

Custom HTML element for embedding isolated webviews (NOT Electron's webview tag). Uses out-of-process iframes (OOPIF) for process isolation and crash protection.

```html
<!DOCTYPE html>
<html>
<head>
  <script src="views://webviewtag/index.js"></script>
</head>
<body>
  <electrobun-webview
    src="https://example.com"
    partition="persist:external"
    preload="views://preloads/external.js"
    sandbox
  ></electrobun-webview>
</body>
</html>
```

```javascript
const webview = document.querySelector('electrobun-webview');

// Navigation
webview.loadURL("https://other-site.com");
webview.goBack();
webview.goForward();
webview.reload();
await webview.canGoBack();
await webview.canGoForward();

// Execute JavaScript
const result = await webview.callAsyncJavaScript({ script: "document.title" });

// Navigation rules (allow/block list)
webview.setNavigationRules([
  "^*",                        // Block all by default
  "*://trusted-site.com/*",    // Allow trusted site
  "^http://*",                 // Block non-HTTPS
]);

// Events
webview.on("dom-ready", (e) => {});
webview.on("did-navigate", (e) => {});
webview.on("did-navigate-in-page", (e) => {});
webview.on("did-commit-navigation", (e) => {});
webview.on("new-window-open", (e) => {});
webview.on("host-message", (e) => { console.log(e.detail); });

// Remove event listener
webview.off("dom-ready", handler);

// Preload script communication
// In preload: window.__electrobunSendToHost({ type: "click", x: 100 });
// In host: webview.on("host-message", (e) => console.log(e.detail));

// Visibility/passthrough
webview.toggleHidden(true);
webview.togglePassthrough(true);
webview.toggleTransparent(true);
```

### Electroview Class (Browser API)

```typescript
import { Electroview } from "electrobun/view";

const rpc = Electroview.defineRPC<MyRPCType>({
  handlers: {
    requests: { /* browser-side request handlers */ },
    messages: { /* browser-side message handlers */ },
  },
});

const electroview = new Electroview({ rpc });

// Call Bun functions from browser
const result = await electroview.rpc.request.someBunFunction({ param: "value" });
electroview.rpc.send.messageToBun({ data: "hello" });
```

Note: No browser-to-browser RPC by design. For cross-view communication, relay messages through the Bun process.

### Browser Global Properties

```typescript
// Available in all browser contexts
window.__electrobunWebviewId  // The webview's unique ID
window.__electrobunWindowId   // The parent window's unique ID
```

### Draggable Regions (Custom Titlebars)

```html
<!-- Add drag class to make regions draggable -->
<div class="electrobun-webkit-app-region-drag">
  <span>My Custom Titlebar</span>
  <button class="electrobun-webkit-app-region-no-drag">Close</button>
</div>
```

Requires `Electroview` to be instantiated in the view for draggable regions to work.

### Tray

System tray icon and menu.

```typescript
import { Tray } from "electrobun/bun";

const tray = new Tray({
  title: "My App",
  image: "views://assets/icon-template.png",
  template: true,  // macOS template image (adapts to light/dark mode)
  width: 22,
  height: 22,
});

tray.setTitle("Updated Title");

tray.setMenu([
  { type: "normal", label: "Open", action: "open" },
  { type: "divider" },
  { type: "normal", label: "Settings", action: "settings", submenu: [
    { type: "normal", label: "Preferences", action: "prefs" },
  ]},
  { type: "normal", label: "Quit", action: "quit" },
]);

tray.on("tray-clicked", (e) => {
  console.log("Tray clicked:", e.data.action);
});

tray.on("tray-item-clicked", (e) => {
  if (e.data.action === "quit") Utils.quit();
});
```

### Context Menu

```typescript
import { ContextMenu } from "electrobun/bun";
import Electrobun from "electrobun/bun";

ContextMenu.showContextMenu([
  { role: "undo" },
  { role: "redo" },
  { type: "separator" },
  { label: "Custom Item", action: "custom-1", tooltip: "Do something", accelerator: "s" },
  { label: "With Data", action: "custom-2", data: { key: "value" } },
  { label: "Disabled Item", action: "custom-3", enabled: false },
  { type: "separator" },
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { role: "selectAll" },
]);

Electrobun.events.on("context-menu-clicked", (e) => {
  console.log("Clicked:", e.data.action);
});
```

Note: Context menus are not currently supported on Linux.

### Application Menu

```typescript
import { ApplicationMenu } from "electrobun/bun";

ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit", role: "quit" }],
  },
  {
    label: "File",
    submenu: [
      { label: "New", action: "new", accelerator: "n" },
      { label: "Open", action: "open", accelerator: "o" },
      { label: "Save", action: "save", accelerator: "s" },
      { type: "separator" },
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
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  },
]);

Electrobun.events.on("application-menu-clicked", (e) => {
  console.log("Menu action:", e.data.action);
});
```

Supported roles: quit, hide, hideOthers, showAll, undo, redo, cut, copy, paste, pasteAndMatchStyle, delete, selectAll, startSpeaking, stopSpeaking, enterFullScreen, exitFullScreen, toggleFullScreen, minimize, zoom, bringAllToFront, close, cycleThroughWindows, showHelp.

Note: Application menus are not currently supported on Linux.

### Utils

```typescript
import { Utils } from "electrobun/bun";

// File system utilities
Utils.moveToTrash(absolutePath);
Utils.showItemInFolder(absolutePath);
Utils.openExternal("https://example.com");
Utils.openPath("/path/to/file.pdf");

// Notifications
Utils.showNotification({
  title: "Reminder",
  subtitle: "Calendar Event",
  body: "Meeting in 15 min",
  silent: false,
});

// File dialog
const chosenPaths = await Utils.openFileDialog({
  startingFolder: "/Users/me/Desktop",
  allowedFileTypes: "*",
  canChooseFiles: true,
  canChooseDirectory: false,
  allowsMultipleSelection: true,
});

// Message box
const { response } = await Utils.showMessageBox({
  type: "question",
  title: "Confirm Delete",
  message: "Are you sure?",
  detail: "This cannot be undone.",
  buttons: ["Delete", "Cancel"],
  defaultId: 1,
  cancelId: 1,
});

// Graceful quit
Utils.quit();
```

### Clipboard API

```typescript
import { Utils } from "electrobun/bun";

Utils.clipboardWriteText("Hello from Electrobun!");
const text = Utils.clipboardReadText();

const pngData = Utils.clipboardReadImage();  // Returns Uint8Array | null
Utils.clipboardWriteImage(new Uint8Array(pngData));

Utils.clipboardClear();
const formats = Utils.clipboardAvailableFormats();
// Possible values: ["text", "image", "files", "html"]
```

### Utils.paths

Cross-platform access to common OS directories and app-scoped directories.

```typescript
import { Utils } from "electrobun/bun";

// OS Directories
Utils.paths.home        // ~ or %USERPROFILE%
Utils.paths.appData     // ~/Library/Application Support, %LOCALAPPDATA%, ~/.local/share
Utils.paths.config      // ~/Library/Application Support, %APPDATA%, ~/.config
Utils.paths.cache       // ~/Library/Caches, %LOCALAPPDATA%, ~/.cache
Utils.paths.temp        // $TMPDIR, %TEMP%, /tmp
Utils.paths.logs        // ~/Library/Logs, %LOCALAPPDATA%, ~/.local/state
Utils.paths.documents   // ~/Documents
Utils.paths.downloads   // ~/Downloads
Utils.paths.desktop     // ~/Desktop
Utils.paths.pictures    // ~/Pictures
Utils.paths.music       // ~/Music
Utils.paths.videos      // ~/Movies (macOS), ~/Videos (other)

// App-scoped directories (scoped by identifier + channel)
Utils.paths.userData    // {appData}/{identifier}/{channel}
Utils.paths.userCache   // {cache}/{identifier}/{channel}
Utils.paths.userLogs    // {logs}/{identifier}/{channel}
```

### GlobalShortcut

```typescript
import { GlobalShortcut } from "electrobun/bun";

const success = GlobalShortcut.register("CommandOrControl+Shift+Space", () => {
  console.log("Global shortcut triggered!");
});

GlobalShortcut.unregister("CommandOrControl+Shift+Space");
GlobalShortcut.unregisterAll();
GlobalShortcut.isRegistered("CommandOrControl+Shift+Space");
```

Accelerator syntax -- Modifiers: `Command`/`Cmd`, `Control`/`Ctrl`, `CommandOrControl`/`CmdOrCtrl`, `Alt`/`Option`, `Shift`, `Super`/`Meta`/`Win`. Keys: `A`-`Z`, `0`-`9`, `F1`-`F12`, `Space`, `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, arrows, and symbols.

### Screen

```typescript
import { Screen } from "electrobun/bun";

const primary = Screen.getPrimaryDisplay();
// { id, bounds: { x, y, width, height }, workArea: { x, y, width, height }, scaleFactor, isPrimary }

const displays = Screen.getAllDisplays();
const cursor = Screen.getCursorScreenPoint();  // { x, y }
```

### Session

Cookie and storage management for webview partitions.

```typescript
import { Session } from "electrobun/bun";

const session = Session.fromPartition("persist:myapp");
const defaultSession = Session.defaultSession;

// Cookies
const cookies = session.cookies.get();
const filtered = session.cookies.get({ domain: "example.com" });
session.cookies.set({
  name: "auth_token", value: "abc123",
  domain: "api.myapp.com", path: "/",
  secure: true, httpOnly: true,
  sameSite: "strict",
  expirationDate: Math.floor(Date.now() / 1000) + 86400,
});
session.cookies.remove("https://myapp.com", "auth_token");
session.cookies.clear();

// Clear storage data
session.clearStorageData();
session.clearStorageData(['cookies', 'localStorage']);
```

### BuildConfig

```typescript
import { BuildConfig } from "electrobun/bun";

const config = await BuildConfig.get();
// { defaultRenderer, availableRenderers, cefVersion?, bunVersion?, runtime }

const cached = BuildConfig.getCached();
```

### PATHS

```typescript
import { PATHS } from "electrobun/bun";

PATHS.RESOURCES_FOLDER  // Static bundled resources
PATHS.VIEWS_FOLDER      // RESOURCES_FOLDER + '/app/views/' (maps to views:// scheme)
```

### Updater

Built-in update system with binary diff (14KB updates).

```typescript
import { Updater } from "electrobun/bun";

const localInfo = await Updater.getLocalInfo();
// { version, hash, baseUrl, channel, name, identifier }

const updateInfo = await Updater.checkForUpdate();
// { version, hash, updateAvailable, updateReady, error }

if (updateInfo.updateAvailable) {
  await Updater.downloadUpdate();
}

if (Updater.updateInfo()?.updateReady) {
  await Updater.applyUpdate(); // Quits, replaces, relaunches
}
```

### Events

```typescript
import Electrobun from "electrobun/bun";

Electrobun.events.on("will-navigate", (e) => {
  console.log("Navigating to:", e.data.url);
});

Electrobun.events.on("open-url", (e) => {
  const url = new URL(e.data.url);
  console.log("Opened with URL:", url.pathname);
});

Electrobun.events.on("context-menu-clicked", (e) => { console.log(e.data.action); });
Electrobun.events.on("application-menu-clicked", (e) => { console.log(e.data.action); });

// Event response control
e.response = { allow: true };
e.responseWasSet;
e.clearResponse();
```

### before-quit Event & Shutdown Lifecycle

```typescript
import Electrobun from "electrobun/bun";

// Fires for ALL quit triggers: Utils.quit(), process.exit(), exitOnLastWindowClosed,
// Cmd+Q, dock quit, Ctrl+C (SIGINT), SIGTERM, updater restart
Electrobun.events.on("before-quit", async (e) => {
  await saveAppState();
  if (hasUnsavedChanges()) {
    e.response = { allow: false };
  }
});
```

Shutdown sequence: before-quit fires -> handlers run (can cancel) -> native event loop stops -> process exits.

Use `before-quit` instead of `process.on("beforeExit")` -- the latter doesn't fire in Electrobun apps.

### views:// URL Scheme

```typescript
// In BrowserWindow
url: "views://mainview/index.html"
// In preload
preload: "views://mainview/preload.js"
// In Tray
image: "views://assets/icon.png"
// In HTML
// <script src="views://mainview/script.js"></script>
// <link href="views://mainview/styles.css" rel="stylesheet">
```

## Build Configuration

```typescript
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.mycompany.myapp",
    version: "1.0.0",
    urlSchemes: ["myapp"],
  },

  runtime: {
    exitOnLastWindowClosed: true,
    myCustomSetting: "hello",
  },

  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      plugins: [],
      external: [],
      sourcemap: "none",
      minify: false,
    },

    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },

    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
    },

    useAsar: false,
    asarUnpack: ["*.node", "*.dll", "*.dylib", "*.so"],
    bunVersion: "1.4.2",

    mac: {
      codesign: true,
      notarize: true,
      bundleCEF: false,
      defaultRenderer: "native",
      icons: "icon.iconset",
      entitlements: {
        "com.apple.security.device.camera": "Camera access description",
      },
      chromiumFlags: { "user-agent": "MyApp/1.0" },
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    win: {
      bundleCEF: false,
      defaultRenderer: "native",
    },
  },

  scripts: {
    preBuild: "./scripts/pre-build.ts",
    postBuild: "./scripts/post-build.ts",
    postWrap: "./scripts/post-wrap.ts",
    postPackage: "./scripts/post-package.ts",
  },

  release: {
    baseUrl: "https://your-bucket.com/updates",
  },
} satisfies ElectrobunConfig;
```

Build lifecycle hooks receive environment variables: `ELECTROBUN_BUILD_ENV`, `ELECTROBUN_OS`, `ELECTROBUN_ARCH`, `ELECTROBUN_BUILD_DIR`, `ELECTROBUN_APP_NAME`, `ELECTROBUN_APP_VERSION`, `ELECTROBUN_APP_IDENTIFIER`, `ELECTROBUN_ARTIFACT_DIR`. The `postWrap` hook also receives `ELECTROBUN_WRAPPER_BUNDLE_PATH`.

## CLI Commands

```bash
bunx electrobun init                        # Default hello-world template
bunx electrobun init photo-booth            # Specific template
bunx electrobun dev                         # Development build and run
bunx electrobun build                       # Dev build (current platform)
bunx electrobun build --env canary          # Canary build
bunx electrobun build --env stable          # Stable build
bunx electrobun build --targets macos-arm64,win-x64,linux-x64  # Cross-compile
```

## Platform Support

| Platform | Architecture | Status | Webview Engine |
|----------|-------------|--------|----------------|
| macOS | ARM64, x64 | Stable | WebKit (WKWebView) |
| Windows | x64 (ARM64 via emulation) | Stable | Edge WebView2 |
| Linux | x64, ARM64 | Stable | WebKitGTK |

All platforms optionally support bundling CEF (Chromium Embedded Framework) for cross-platform consistency. Linux strongly recommends CEF due to WebKitGTK limitations.

macOS and Windows support mixed renderers (native + CEF) per window. Linux does not support mixing.

## Common Patterns

### Window with Custom Titlebar

```typescript
const win = new BrowserWindow({
  title: "Custom Chrome",
  url: "views://main/index.html",
  titleBarStyle: "hidden",
  transparent: true,
});
```

```html
<div class="electrobun-webkit-app-region-drag">
  <span>My App</span>
  <button class="electrobun-webkit-app-region-no-drag" onclick="closeWindow()">X</button>
</div>
```

### Multi-Window App

```typescript
import { BrowserWindow } from "electrobun/bun";

const windows = new Map();

function createWindow() {
  const win = new BrowserWindow({ url: "views://main/index.html" });
  windows.set(win.id, win);

  win.on("close", (e) => {
    windows.delete(e.data.id);
  });

  return win;
}
```

### Secure External Content

```html
<electrobun-webview
  src="https://external-site.com"
  partition="external"
  sandbox
></electrobun-webview>
```

```javascript
webview.setNavigationRules([
  "^*",
  "*://external-site.com/*",
  "*://cdn.external-site.com/*",
]);
```

### Graceful Shutdown with Cleanup

```typescript
import Electrobun from "electrobun/bun";

Electrobun.events.on("before-quit", async (e) => {
  await saveAppState();
  await closeDatabase();
});
```
