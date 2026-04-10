import type { QuickJSAsyncContext, QuickJSContext, QuickJSHandle } from "quickjs-emscripten";

export async function resolveMaybePromiseHandle(
  context: QuickJSContext | QuickJSAsyncContext,
  handle: QuickJSHandle,
): Promise<QuickJSHandle> {
  const promiseState = context.getPromiseState(handle);
  if (promiseState.type === "fulfilled" && promiseState.notAPromise) {
    return handle;
  }

  if (promiseState.type === "fulfilled" && !promiseState.notAPromise) {
    promiseState.value.dispose();
  } else if (promiseState.type === "rejected") {
    promiseState.error.dispose();
  }

  try {
    const resolved = await context.resolvePromise(handle);
    return context.unwrapResult(resolved);
  } finally {
    handle.dispose();
  }
}
