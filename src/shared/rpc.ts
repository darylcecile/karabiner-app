import { RPCSchema } from "electrobun/bun";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      getAppInfo: {
        params: Record<string, never>;
        response: { name: string; version: string };
      };
    };
    messages: {
      log: { message: string };
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      notify: { text: string };
    };
  }>;
};
