type AcceptedSources = Electron.IpcMain | Electron.IpcRenderer;

type RelayMainMethods = {
	[methodName: string]: (...args: any[]) => Promise<any> | any;
}

type RelayRendererMethods = {
	[methodName: string]: (...args: any[]) => Promise<void>;
}

type RelayMethods = RelayMainMethods | RelayRendererMethods;

type RelayResponse<T> =
	| { success: true; result: T }
	| { success: false; error: string };

const clientPrivateHooks: unique symbol = Symbol("RelayClientPrivateHooks");

export class RelayClient<Methods extends RelayMethods> {

	#syncMap: Map<keyof Methods, "sync" | "async"> | null = null;

	constructor(private methods: Methods) { }

	defineMethods<M extends RelayMethods>(methods: M) {
		return new RelayClient<Methods & M>({
			...this.methods,
			...methods
		});
	}

	attach(source: AcceptedSources) {
		const client = this;
		const clientMethodNames = Object.keys(client.methods) as (keyof Methods)[];

		if ("on" in source === false) {
			throw new Error("Invalid source provided to RelayClient.handle. Expected ipcMain or ipcRenderer.");
		}

		const isMain = client.isIpcMain(source);

		if (isMain) {
			// ipcMain
			for (const methodName of clientMethodNames) {
				const handler = client.methods[methodName];
				const isAsync = handler.constructor.name === "AsyncFunction";
				const messageChannel = `relay:invoke:${String(methodName)}`

				if (isAsync) {
					async function handler(_event: Electron.IpcMainInvokeEvent, ...args: any[]) {
						try {
							const result = await client.methods[methodName](...args);
							return { success: true, result };
						} catch (error) {
							return { success: false, error: error instanceof Error ? error.message : String(error) };
						}
					}

					source.handle(messageChannel, handler);
				} else {
					function handler(event: Electron.IpcMainEvent, ...args: any[]) {
						try {
							const result = client.methods[methodName](...args);
							event.returnValue = { success: true, result };
						} catch (error) {
							event.returnValue = { success: false, error: error instanceof Error ? error.message : String(error) };
						}
					}

					source.on(messageChannel, handler);
				}
			}

			source.on('relay:getSyncMap', (event) => {
				const syncMap: Record<keyof Methods, "sync" | "async"> = {} as any;
				for (const methodName of clientMethodNames) {
					syncMap[methodName] = client.syncMap.get(methodName)!;
				}
				event.returnValue = syncMap;
			});

			return;
		}

		// ipcRenderer
		for (const methodName of clientMethodNames) {
			const methodHandler = client.methods[methodName];
			const isAsync = methodHandler.constructor.name === "AsyncFunction";
			const messageChannel = `relay:invoke:${String(methodName)}`;

			async function handler(event: Electron.IpcRendererEvent, ...args: any[]) {
				try {
					await methodHandler(...args);
				} catch (error) {
					console.error(`Error in handler for ${String(methodName)}:`, error);
					// Note: In ipcRenderer, we can't send a response back to the main process in the same way as ipcMain.handle, so we just log the error here.
				}
			}

			source.on(messageChannel, handler);
		}
	}

	get syncMap() {
		if (this.#syncMap) return this.#syncMap;
		const m = new Map<keyof Methods, "sync" | "async">();
		for (const methodName in this.methods) {
			const handler = this.methods[methodName];
			const isAsync = handler.constructor.name === "AsyncFunction";
			m.set(methodName, isAsync ? "async" : "sync");
		}
		this.#syncMap = m;
		return m;
	}

	protected isIpcMain(source: AcceptedSources): source is Electron.IpcMain {
		return "on" in source && !("send" in source);
	}

	protected isIpcRenderer(source: AcceptedSources): source is Electron.IpcRenderer {
		return "on" in source && "send" in source;
	}

	get [clientPrivateHooks]() {
		return {
			methods: this.methods,
		}
	}
}

export function createRelay() {
	const client = new RelayClient({});
	return client;
}

function getWorld() {
	if (typeof window === "undefined") {
		return "main";
	} else {
		return "renderer";
	}
}

export function createPreloadTerminal<
	RC extends RelayClient<any>,
	MM extends RelayMethods = RC extends RelayClient<infer M> ? M : never
>(
	contextBridge: Pick<Electron.ContextBridge, "exposeInMainWorld">,
	ipcRenderer: Electron.IpcRenderer
) {
	const syncMap = ipcRenderer.sendSync('relay:getSyncMap') as Record<keyof MM, "sync" | "async">;

	function unwrapResponse<T>(response: RelayResponse<T>): T {
		if (!response || typeof response !== "object" || !("success" in response)) {
			throw new Error("Invalid relay response.");
		}

		if (!response.success) {
			throw new Error(response.error);
		}

		return response.result;
	}

	const methods = syncMap;
	const methodNames = Object.keys(methods) as (keyof typeof syncMap)[];

	const forwardMap = methodNames.map((methodName) => {
		const isAsync = methods[methodName] === "async";
		const messageChannel = `relay:invoke:${String(methodName)}`;

		return [
			methodName,
			(...args: Parameters<MM[typeof methodName]>) => {
				if (isAsync) {
					return ipcRenderer
						.invoke(messageChannel, ...args)
						.then((response) => unwrapResponse(response as RelayResponse<Awaited<ReturnType<MM[typeof methodName]>>>));
				} else {
					return unwrapResponse(
						ipcRenderer.sendSync(messageChannel, ...args) as RelayResponse<ReturnType<MM[typeof methodName]>>
					);
				}
			}
		]
	})

	contextBridge.exposeInMainWorld(
		"ipcRelay",
		Object.fromEntries([
			...forwardMap,
			['_syncMap', () => ipcRenderer.sendSync('relay:getSyncMap') as Record<keyof MM, "sync" | "async">],
		])
	);
}

export function createRelayTerminal<RC extends RelayClient<any>>() {
	type RCMethods = RC extends RelayClient<infer M> ? M : never;

	if (getWorld() === "main") {
		console.error("createRelayTerminal should only be used in the renderer process.");
		return {} as RCMethods;
	}

	const syncMap = window.ipcRelay._syncMap() as Record<keyof RCMethods, "sync" | "async">;

	return new Proxy({} as RCMethods, {
		get(_target, prop: keyof RCMethods) {
			return ((...args: any[]) => {
				if (!(prop in syncMap)) {
					throw new Error(`Method ${String(prop)} is not defined in the relay client.`);
				}

				return window.ipcRelay[String(prop)](...args);
			}) as RCMethods[typeof prop];
		}
	}) as RCMethods;
}
