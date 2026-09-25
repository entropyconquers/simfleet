import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "@/lib/theme";
import { startPolling } from "@/lib/fleet-store";
import App from "./App.tsx";

startPolling();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
