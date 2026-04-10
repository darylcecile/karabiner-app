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
    if ("error" in resolved) {
      const rejectionHandle = resolved.error;
      if (!rejectionHandle) {
        throw new Error("QuickJS promise rejected without an error handle.");
      }
      try {
        throw new Error(
          `QuickJS promise rejected: ${formatQuickJSError(context, rejectionHandle)}`,
        );
      } finally {
        rejectionHandle.dispose();
      }
    }
    return resolved.value;
  } finally {
    handle.dispose();
  }
}

function formatQuickJSError(
  context: QuickJSContext | QuickJSAsyncContext,
  errorHandle: QuickJSHandle,
): string {
  const dumped = context.dump(errorHandle);
  if (
    dumped &&
    typeof dumped === "object" &&
    !Array.isArray(dumped) &&
    "message" in dumped &&
    typeof dumped.message === "string"
  ) {
    return dumped.message;
  }
  if (typeof dumped === "string") {
    return dumped;
  }
  try {
    return JSON.stringify(dumped);
  } catch {
    return String(dumped);
  }
}
