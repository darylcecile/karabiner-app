import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";
import { App } from "./App";
import "./blocknote.css";
import "./index.css";
import "./rpc";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
