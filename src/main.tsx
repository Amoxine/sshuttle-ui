import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";

import App from "@/App";
import "@/index.css";
import { initSentryIfConsented } from "@/utils/sentry";

initSentryIfConsented();

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
      containerStyle={{ bottom: 72, right: 16 }}
      gutter={8}
    />
  </React.StrictMode>,
);
