# Relay

`relay` is a small Electron helper for exposing main-process methods to the renderer through preload, while keeping the renderer API typed.

From a consumer perspective, it gives you this shape:

- define methods once in the main process
- expose them in preload
- call them from the renderer like a normal object

## Example

```ts
// main
import { ipcMain } from "electron/main";

export const mainRelay = new RelayClient({
  getConfig() {
    return { theme: "dark" };
  },
  async readFile(filePath: string) {
    return await Bun.file(filePath).text();
  },
});

mainRelay.attach(ipcMain);
```

```ts
// preload
import { contextBridge, ipcRenderer } from 'electron';

createPreloadTerminal<typeof mainRelay>(contextBridge, ipcRenderer);
```

```ts
// renderer
const main = createRelayTerminal<typeof mainRelay>();

const config = main.getConfig();
const content = await main.readFile("/tmp/note.md");
```

## Install Shape

This package currently exposes four public entry points:

```ts
import {
  RelayClient,
  createRelay,
  createPreloadTerminal,
  createRelayTerminal,
} from "@karabiner/relay";
```

## Main Process

Create a relay by passing an object of methods to `RelayClient`.

```ts
import { ipcMain } from "electron/main";
import { RelayClient } from "@karabiner/relay";

export const mainRelay = new RelayClient({
  getConfig() {
    return { theme: "dark" };
  },
  setConfig(key: string, value: unknown) {
    return { [key]: value };
  },
  async readFile(filePath: string) {
    return await Bun.file(filePath).text();
  },
  async writeFile(filePath: string, content: string) {
    await Bun.write(filePath, content);
    return true;
  },
});

mainRelay.attach(ipcMain);
```

`attach(ipcMain)` registers every method on Electron IPC so preload can forward them into the renderer.

## Preload

In preload, expose the relay into the isolated renderer world.

```ts
import { contextBridge, ipcRenderer } from "electron";
import { createPreloadTerminal } from "@karabiner/relay";
import type { MainRelay } from "@/main/ipcMethods";

createPreloadTerminal<MainRelay>(contextBridge, ipcRenderer);
```

This creates `window.ipcRelay` behind the scenes. Most consumers should not use `window.ipcRelay` directly.

## Renderer

In the renderer, create a typed terminal from the main relay type.

```ts
import { createRelayTerminal } from "@karabiner/relay";
import type { MainRelay } from "@/main/ipcMethods";

export const main = createRelayTerminal<MainRelay>();
```

You can then call relay methods as if they were local:

```ts
const config = main.getConfig();
const content = await main.readFile("/tmp/note.md");
await main.writeFile("/tmp/note.md", `${content}\nupdated`);
```

Behavior at the call site:

- sync main methods return sync values in the renderer
- async main methods return promises in the renderer
- errors thrown in main are rethrown in the renderer as plain `Error`

## Growing a Relay

If you prefer to build a relay in steps, use `createRelay()` and `defineMethods()`.

```ts
import { createRelay } from "@karabiner/relay";

const baseRelay = createRelay().defineMethods({
  ping() {
    return "pong";
  },
});

export const mainRelay = baseRelay.defineMethods({
  async readFile(path: string) {
    return await Bun.file(path).text();
  },
});
```

`defineMethods()` returns a new relay with the additional methods merged into its type.

## Method Rules

Methods exposed from main can be:

- synchronous
- asynchronous

Typical examples:

```ts
const relay = new RelayClient({
  version() {
    return "1.0.0";
  },
  async readFile(path: string) {
    return await Bun.file(path).text();
  },
});
```

The library uses the method shape to decide whether to forward the call through sync IPC or async IPC.

## What Consumers Should Expect

- The renderer gets a typed proxy based on the main relay type
- The preload layer handles response unwrapping for you
- You do not need to manually name channels for each method

## Current Constraints

Consumers should be aware of the current limits of the library:

- channel names are global and not namespaced
- there is no runtime argument validation
- there are no timeout controls
- there are no custom error classes
- the main-to-renderer path is not a full typed request/response client API
