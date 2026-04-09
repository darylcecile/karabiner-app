import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc";

const rpc = Electroview.defineRPC<AppRPC>({
  handlers: {
    requests: {},
    messages: {
      notify: ({ text }) => {
        console.log("[notify]", text);
      },
    },
  },
});

export const electroview = new Electroview({ rpc });
