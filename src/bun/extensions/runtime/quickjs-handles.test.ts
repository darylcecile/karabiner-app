import { describe, expect, it } from "bun:test";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten";
import { resolveMaybePromiseHandle } from "./quickjs-handles";

type MockHandle = {
  disposed: boolean;
  dispose: () => void;
};

function createHandle(): MockHandle {
  const handle: MockHandle = {
    disposed: false,
    dispose: () => {
      handle.disposed = true;
    },
  };
  return handle;
}

describe("resolveMaybePromiseHandle", () => {
  it("returns non-promise handles directly", async () => {
    const input = createHandle();
    const context = {
      getPromiseState: () => ({
        type: "fulfilled",
        notAPromise: true,
      }),
      resolvePromise: async () => {
        throw new Error("resolvePromise should not be called for non-promises");
      },
    } as unknown as QuickJSContext;

    const resolved = await resolveMaybePromiseHandle(
      context,
      input as unknown as QuickJSHandle,
    );

    expect(resolved).toBe(input as unknown as QuickJSHandle);
    expect(input.disposed).toBe(false);
  });

  it("disposes fulfilled promise snapshots and input handles", async () => {
    const input = createHandle();
    const output = createHandle();
    const snapshot = createHandle();
    const context = {
      getPromiseState: () => ({
        type: "fulfilled",
        value: snapshot as unknown as QuickJSHandle,
      }),
      resolvePromise: async () => ({ value: output as unknown as QuickJSHandle }),
    } as unknown as QuickJSContext;

    const resolved = await resolveMaybePromiseHandle(
      context,
      input as unknown as QuickJSHandle,
    );

    expect(resolved).toBe(output as unknown as QuickJSHandle);
    expect(snapshot.disposed).toBe(true);
    expect(input.disposed).toBe(true);
  });

  it("disposes rejected promise handles and input handles", async () => {
    const input = createHandle();
    const snapshotError = createHandle();
    const rejectedError = createHandle();
    const context = {
      getPromiseState: () => ({
        type: "rejected",
        error: snapshotError as unknown as QuickJSHandle,
      }),
      resolvePromise: async () => ({
        error: rejectedError as unknown as QuickJSHandle,
      }),
      dump: () => "boom",
    } as unknown as QuickJSContext;

    await expect(
      resolveMaybePromiseHandle(context, input as unknown as QuickJSHandle),
    ).rejects.toThrow("QuickJS promise rejected: boom");
    expect(snapshotError.disposed).toBe(true);
    expect(rejectedError.disposed).toBe(true);
    expect(input.disposed).toBe(true);
  });

  it("disposes the input handle when resolvePromise rejects", async () => {
    const input = createHandle();
    const context = {
      getPromiseState: () => ({
        type: "pending",
        error: new Error("pending"),
      }),
      resolvePromise: async () => {
        throw new Error("resolve failed");
      },
    } as unknown as QuickJSContext;

    await expect(
      resolveMaybePromiseHandle(context, input as unknown as QuickJSHandle),
    ).rejects.toThrow("resolve failed");
    expect(input.disposed).toBe(true);
  });
});
