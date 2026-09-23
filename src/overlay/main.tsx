import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@/styles/globals.css";
import "@/i18n";
import { OverlayApp } from "./OverlayApp";

document.documentElement.dataset.theme = "dark";
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
