import { useState } from "react";
import { electroview } from "./rpc";

export function App() {
  const [info, setInfo] = useState<{ name: string; version: string } | null>(
    null,
  );

  async function fetchInfo() {
    const result = await electroview.rpc!.request.getAppInfo({});
    setInfo(result);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Karabiner</h1>
        <p className="text-neutral-400">
          Desktop app powered by Electrobun + React + Tailwind
        </p>
        {info ? (
          <p className="text-sm text-neutral-500">
            {info.name} v{info.version}
          </p>
        ) : (
          <button
            onClick={fetchInfo}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
          >
            Get App Info
          </button>
        )}
      </div>
    </div>
  );
}
