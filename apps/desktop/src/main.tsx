import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@cevra/ui/tokens.css";
import "./styles.css";
import { App } from "./App";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";

async function mount() {
  const backend = "__TAURI_INTERNALS__" in window ? new TauriDesktopBackend()
    : import.meta.env.DEV && new URLSearchParams(window.location.search).get("editorial-fixture") === "1"
      ? new (await import("./backend/editorial-fixture-backend")).EditorialFixtureBackend()
      : new DemoDesktopBackend();
  createRoot(document.getElementById("root")!).render(<StrictMode><App backend={backend} /></StrictMode>);
}
void mount();
