type AnyFunction = (...args: any[]) => any;

type RelayMethodMode = "sync" | "async";

type RelayMethodConfig<F extends AnyFunction = AnyFunction> = {
	handler: F;
	mode?: RelayMethodMode;
	timeoutMs?: number;
};

type RelayMethodDefinition<F extends AnyFunction = AnyFunction> =
	| F
	| RelayMethodConfig<F>;

type RelayMethodDefinitions = Record<string, RelayMethodDefinition>;

type ExtractRelayHandler<T> =
	T extends RelayMethodConfig<infer F> ? F :
	T extends AnyFunction ? T :
	never;

type RelayMethodsFromDefinitions<T extends RelayMethodDefinitions> = {
	[K in keyof T]: ExtractRelayHandler<T[K]>;
};

type RelayMethods = Record<string, AnyFunction>;

type SerializedRelayError = {
	name: string;
	message: string;
	code: string;
	details?: unknown;
	stack?: string;
};

type RelayResponse<T> =
	| { success: true; result: T }
	| { success: false; error: SerializedRelayError };

type RelayPublicMethodMetadata = {
	mode: RelayMethodMode;
	timeoutMs: number | null;
};

type RelayPublicMetadata<Methods extends RelayMethods> = {
	namespace: string;
	timeoutMs: number | null;
	methods: Record<keyof Methods, RelayPublicMethodMetadata>;
};

type RelayBridge<Methods extends RelayMethods> = {
	__getRelayMetadata: () => RelayPublicMetadata<Methods>;
} & {
	[K in keyof Methods]: (...args: Parameters<Methods[K]>) => Methods[K] extends (...args: any[]) => Promise<infer R>
		? Promise<R>
		: ReturnType<Methods[K]>;
};

type NormalizedRelayMethod = {
	handler: AnyFunction;
	mode: RelayMethodMode;
	timeoutMs: number | null;
};

type NormalizedRelayMethods<Methods extends RelayMethods> = Record<keyof Methods, NormalizedRelayMethod>;

type CreateMainRelayOptions<T extends RelayMethodDefinitions> = {
	methods: T;
	namespace?: string;
	timeoutMs?: number;
};

function isRelayMethodConfig(value: RelayMethodDefinition): value is RelayMethodConfig {
	return typeof value === "object" && value !== null && "handler" in value;
}

function detectMethodMode(handler: AnyFunction): RelayMethodMode {
	return handler.constructor.name === "AsyncFunction" ? "async" : "sync";
}

function normalizeTimeoutMs(timeoutMs?: number): number | null {
	if (timeoutMs == null) {
		return null;
	}

	return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null;
}

function normalizeMethod(
	definition: RelayMethodDefinition,
	defaultTimeoutMs: number | null,
): NormalizedRelayMethod {
	if (isRelayMethodConfig(definition)) {
		return {
			handler: definition.handler,
			mode: definition.mode ?? detectMethodMode(definition.handler),
			timeoutMs: normalizeTimeoutMs(definition.timeoutMs) ?? defaultTimeoutMs,
		};
	}

	return {
		handler: definition,
		mode: detectMethodMode(definition),
		timeoutMs: defaultTimeoutMs,
	};
}

function createChannels(namespace: string) {
	return {
		metadata: `${namespace}:metadata`,
		invoke(methodName: string) {
			return `${namespace}:invoke:${methodName}`;
		},
	};
}

function getWorld() {
	return typeof window === "undefined" ? "main" : "renderer";
}

function serializeRelayError(error: unknown): SerializedRelayError {
	if (error instanceof RelayError) {
		return {
			name: error.name,
			message: error.message,
			code: error.code,
			details: error.details,
			stack: error.stack,
		};
	}

	if (error instanceof Error) {
		return {
			name: error.name || "Error",
			message: error.message,
			code: "RELAY_REMOTE_ERROR",
			stack: error.stack,
		};
	}

	return {
		name: "Error",
		message: String(error),
		code: "RELAY_REMOTE_ERROR",
	};
}

function deserializeRelayError(error: SerializedRelayError): RelayRemoteError {
	return new RelayRemoteError(error);
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number | null,
	methodName: string,
): Promise<T> {
	if (!timeoutMs) {
		return promise;
	}

	return new Promise<T>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject(new RelayTimeoutError(methodName, timeoutMs));
		}, timeoutMs);

		promise.then(
			(result) => {
				window.clearTimeout(timeoutId);
				resolve(result);
			},
			(error) => {
				window.clearTimeout(timeoutId);
				reject(error);
			},
		);
	});
}

function unwrapResponse<T>(response: RelayResponse<T>): T {
	if (!response || typeof response !== "object" || !("success" in response)) {
		throw new RelayError("Invalid relay response.", {
			code: "RELAY_INVALID_RESPONSE",
		});
	}

	if (!response.success) {
		throw deserializeRelayError(response.error);
	}

	return response.result;
}

export class RelayError extends Error {
	code: string;
	details?: unknown;

	constructor(
		message: string,
		options: {
			code?: string;
			details?: unknown;
			cause?: unknown;
			name?: string;
		} = {},
	) {
		super(message, { cause: options.cause });
		this.name = options.name ?? "RelayError";
		this.code = options.code ?? "RELAY_ERROR";
		this.details = options.details;
	}
}

export class RelayRemoteError extends RelayError {
	constructor(error: SerializedRelayError) {
		super(error.message, {
			code: error.code,
			details: error.details,
			name: error.name || "RelayRemoteError",
		});

		if (error.stack) {
			this.stack = error.stack;
		}
	}
}

export class RelayTimeoutError extends RelayError {
	constructor(methodName: string, timeoutMs: number) {
		super(`Relay method "${methodName}" timed out after ${timeoutMs}ms.`, {
			code: "RELAY_TIMEOUT",
			details: { methodName, timeoutMs },
			name: "RelayTimeoutError",
		});
	}
}

export class MainRelay<Methods extends RelayMethods> {
	readonly namespace: string;
	readonly timeoutMs: number | null;

	constructor(
		private readonly methods: Methods,
		private readonly normalizedMethods: NormalizedRelayMethods<Methods>,
		options: {
			namespace?: string;
			timeoutMs?: number | null;
		} = {},
	) {
		this.namespace = options.namespace ?? "relay";
		this.timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? undefined);
	}

	attach(ipcMain: Electron.IpcMain) {
		const methodNames = Object.keys(this.methods) as (keyof Methods)[];
		const channels = createChannels(this.namespace);

		for (const methodName of methodNames) {
			const normalizedMethod = this.normalizedMethods[methodName];
			const channel = channels.invoke(String(methodName));

			if (normalizedMethod.mode === "async") {
				ipcMain.handle(channel, async (_event, ...args: any[]) => {
					try {
						const result = await normalizedMethod.handler(...args);
						return { success: true, result } satisfies RelayResponse<unknown>;
					} catch (error) {
						return { success: false, error: serializeRelayError(error) } satisfies RelayResponse<unknown>;
					}
				});

				continue;
			}

			ipcMain.on(channel, (event, ...args: any[]) => {
				try {
					const result = normalizedMethod.handler(...args);
					event.returnValue = { success: true, result } satisfies RelayResponse<unknown>;
				} catch (error) {
					event.returnValue = { success: false, error: serializeRelayError(error) } satisfies RelayResponse<unknown>;
				}
			});
		}

		ipcMain.on(channels.metadata, (event) => {
			event.returnValue = this.getPublicMetadata();
		});
	}

	getPublicMetadata(): RelayPublicMetadata<Methods> {
		const methods = {} as Record<keyof Methods, RelayPublicMethodMetadata>;

		for (const methodName of Object.keys(this.methods) as (keyof Methods)[]) {
			const method = this.normalizedMethods[methodName];
			methods[methodName] = {
				mode: method.mode,
				timeoutMs: method.timeoutMs,
			};
		}

		return {
			namespace: this.namespace,
			timeoutMs: this.timeoutMs,
			methods,
		};
	}
}

export type RelayMethodsOf<T> =
	T extends MainRelay<infer Methods> ? Methods :
	never;

export function method<F extends AnyFunction>(
	handler: F,
	options: Omit<RelayMethodConfig<F>, "handler"> = {},
): RelayMethodConfig<F> {
	return {
		handler,
		...options,
	};
}

export function syncMethod<F extends AnyFunction>(
	handler: F,
	options: Omit<RelayMethodConfig<F>, "handler" | "mode"> = {},
): RelayMethodConfig<F> {
	return {
		handler,
		mode: "sync",
		...options,
	};
}

export function createMainRelay<T extends RelayMethodDefinitions>(
	options: CreateMainRelayOptions<T>,
): MainRelay<RelayMethodsFromDefinitions<T>> {
	const namespace = options.namespace ?? "relay";
	const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
	const methods = {} as RelayMethodsFromDefinitions<T>;
	const normalizedMethods = {} as NormalizedRelayMethods<RelayMethodsFromDefinitions<T>>;

	for (const methodName of Object.keys(options.methods) as (keyof T)[]) {
		const definition = options.methods[methodName];
		const normalized = normalizeMethod(definition, timeoutMs);
		(methods as Record<keyof T, AnyFunction>)[methodName] = normalized.handler;
		(normalizedMethods as Record<keyof T, NormalizedRelayMethod>)[methodName] = normalized;
	}

	return new MainRelay(methods, normalizedMethods, {
		namespace,
		timeoutMs,
	});
}

export function exposeRelay<Methods extends RelayMethods>(
	contextBridge: Pick<Electron.ContextBridge, "exposeInMainWorld">,
	apiKey: string,
	ipcRenderer: Electron.IpcRenderer,
	options: {
		namespace?: string;
	} = {},
) {
	const channels = createChannels(options.namespace ?? "relay");
	const metadata = ipcRenderer.sendSync(channels.metadata) as RelayPublicMetadata<Methods>;
	const bridgeEntries = Object.keys(metadata.methods).map((methodName) => {
		const methodMeta = metadata.methods[methodName as keyof Methods];
		const channel = channels.invoke(methodName);

		return [
			methodName,
			(...args: any[]) => {
				if (methodMeta.mode === "async") {
					return withTimeout(
						ipcRenderer.invoke(channel, ...args).then((response) => unwrapResponse(response as RelayResponse<unknown>)),
						methodMeta.timeoutMs,
						methodName,
					);
				}

				return unwrapResponse(ipcRenderer.sendSync(channel, ...args) as RelayResponse<unknown>);
			},
		] as const;
	});

	contextBridge.exposeInMainWorld(
		apiKey,
		Object.fromEntries([
			...bridgeEntries,
			["__getRelayMetadata", () => metadata],
		]) as RelayBridge<Methods>,
	);
}

export function createRendererRelay<Methods extends RelayMethods>(apiKey: string) {
	if (getWorld() === "main") {
		console.error("createRendererRelay should only be used in the renderer process.");
		return {} as Methods;
	}

	const bridge = window[apiKey as keyof Window] as RelayBridge<Methods> | undefined;

	if (!bridge || typeof bridge !== "object" || typeof bridge.__getRelayMetadata !== "function") {
		throw new RelayError(`Relay "${apiKey}" is not available on window.`, {
			code: "RELAY_NOT_EXPOSED",
			details: { apiKey },
		});
	}

	const metadata = bridge.__getRelayMetadata();

	return new Proxy({} as Methods, {
		get(_target, prop: string | symbol) {
			if (typeof prop !== "string") {
				return undefined;
			}

			return ((...args: any[]) => {
				if (!(prop in metadata.methods)) {
					throw new RelayError(`Method "${String(prop)}" is not defined in relay "${apiKey}".`, {
						code: "RELAY_METHOD_NOT_FOUND",
						details: {
							apiKey,
							methodName: String(prop),
						},
					});
				}

				return (bridge[prop as keyof Methods] as AnyFunction)(...args);
			}) as Methods[keyof Methods];
		},
	}) as Methods;
}

export function defineRelay<T extends RelayMethodDefinitions>(methods: T) {
	return methods;
}
