import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@/styles/globals.css";
import "@/i18n";
import { PopupApp } from "./PopupApp";

// The popup window is transparent; only the card is visible.
document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
document.documentElement.dataset.theme = "dark";
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
