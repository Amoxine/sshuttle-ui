import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";

import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        className:
          "!bg-ink-800 !text-ink-100 !border !border-ink-700 !shadow-lg",
        duration: 4000,
      }}
    />
  </React.StrictMode>,
);
