import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/600.css";
const preview =
  new URLSearchParams(location.search).get("preview") === "redesign";
const Entry = React.lazy(
  preview
    ? () => import("./design-lab/DesignLab")
    : () => import("./Production"),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense
      fallback={
        <p role="status" style={{ padding: 32 }}>
          正在打开工作台…
        </p>
      }
    >
      <Entry />
    </React.Suspense>
  </React.StrictMode>,
);
