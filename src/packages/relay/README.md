# Relay

`@karabiner/relay` is a small Electron helper for exposing main-process methods to the renderer with a typed API.

The intended flow is:

1. Define your main-process methods once.
2. Attach them in the main process.
3. Expose them in preload.
4. Call them from the renderer like a normal object.

## Public API

```ts
import {
  RelayError,
  RelayRemoteError,
  RelayTimeoutError,
  RelayMethodsOf,
  createMainRelay,
  createRendererRelay,
  exposeRelay,
  method,
  syncMethod,
} from "@karabiner/relay";
```

## Quick Start

### Main

```ts
import { ipcMain } from "electron/main";
import { createMainRelay, syncMethod } from "@karabiner/relay";

export const mainRelay = createMainRelay({
  namespace: "app:main",
  timeoutMs: 10_000,
  methods: {
    getConfig: syncMethod(() => {
      return { theme: "dark" };
    }),
    async readFile(filePath: string) {
      return await Bun.file(filePath).text();
    },
  },
});

mainRelay.attach(ipcMain);
```

### Preload

```ts
import { contextBridge, ipcRenderer } from "electron";
import { exposeRelay } from "@karabiner/relay";
import type { MainRelayMethods } from "@/main/ipcMethods";

exposeRelay<MainRelayMethods>(contextBridge, "mainRelay", ipcRenderer, {
  namespace: "app:main",
});
```

### Renderer

```ts
import { createRendererRelay } from "@karabiner/relay";
import type { MainRelayMethods } from "@/main/ipcMethods";

export const main = createRendererRelay<MainRelayMethods>("mainRelay");

const config = main.getConfig();
const content = await main.readFile("/tmp/note.md");
```

## What You Get

At the renderer call site:

- sync main methods stay sync
- async main methods stay async
- main-process errors are rethrown as relay errors
- async methods use the configured timeout

## Defining Methods

You define a relay by passing a `methods` object to `createMainRelay`.

```ts
import { createMainRelay } from "@karabiner/relay";

export const relay = createMainRelay({
  namespace: "files",
  methods: {
    version() {
      return "1.0.0";
    },
    async readFile(path: string) {
      return await Bun.file(path).text();
    },
  },
});
```

Plain functions work out of the box. The relay will infer whether they are sync or async.

## Making Sync Methods Explicit

For methods that must stay synchronous, prefer `syncMethod(...)`.

```ts
import { createMainRelay, syncMethod } from "@karabiner/relay";

export const relay = createMainRelay({
  methods: {
    platform: syncMethod(() => process.platform),
    homeDir: syncMethod(() => process.env.HOME || ""),
  },
});
```

That removes ambiguity at the definition site and makes the transport mode obvious in code review.

## Per-Method Options

Use `method(...)` when you want to add options such as a custom timeout.

```ts
import { createMainRelay, method } from "@karabiner/relay";

export const relay = createMainRelay({
  timeoutMs: 10_000,
  methods: {
    async readFile(path: string) {
      return await Bun.file(path).text();
    },
    slowTask: method(
      async (id: string) => {
        return await runSlowTask(id);
      },
      { timeoutMs: 30_000 },
    ),
  },
});
```

## Typing The Renderer API

If you want the renderer API type from the relay instance, use `RelayMethodsOf`.

```ts
import type { RelayMethodsOf } from "@karabiner/relay";

export type MainRelayMethods = RelayMethodsOf<typeof mainRelay>;
```

That type is what you pass into `exposeRelay<...>()` and `createRendererRelay<...>()`.

## Errors

Relay throws structured errors instead of returning `{ success, error }` payloads to the renderer.

```ts
import {
  RelayError,
  RelayRemoteError,
  RelayTimeoutError,
} from "@karabiner/relay";

try {
  await main.readFile("/tmp/missing.md");
} catch (error) {
  if (error instanceof RelayTimeoutError) {
    console.error("timed out", error.details);
  } else if (error instanceof RelayRemoteError) {
    console.error(error.code, error.message, error.details);
  } else if (error instanceof RelayError) {
    console.error(error.code, error.message);
  }
}
```

Available error types:

- `RelayError`
- `RelayRemoteError`
- `RelayTimeoutError`

## Namespaces

Relay channels are namespaced. Use a stable namespace string for each relay:

```ts
createMainRelay({
  namespace: "karabiner:main",
  methods: { ... },
});
```

Use the same namespace in preload:

```ts
exposeRelay(contextBridge, "mainRelay", ipcRenderer, {
  namespace: "karabiner:main",
});
```

Namespaces keep different relay setups from colliding on the same Electron IPC channels.

## Consumer Notes

- The renderer should use the proxy returned by `createRendererRelay(...)`, not the raw window global.
- `apiKey` is the name of the global exposed by preload. It does not have to match the namespace.
- Timeouts apply to async methods only.
- There is no runtime schema validation yet.
- The current package focuses on the renderer-to-main path. It does not yet expose a symmetric typed main-to-renderer client API.

## In This Repo

Current app wiring:

- main relay definition: [`electron/main/ipcMethods.ts`](/Users/daryl/code/GitHub/karabiner-app/electron/main/ipcMethods.ts)
- main registration: [`electron/main/index.ts`](/Users/daryl/code/GitHub/karabiner-app/electron/main/index.ts)
- preload exposure: [`electron/preload/index.ts`](/Users/daryl/code/GitHub/karabiner-app/electron/preload/index.ts)
- renderer proxy: [`electron/renderer/relay.ts`](/Users/daryl/code/GitHub/karabiner-app/electron/renderer/relay.ts)
