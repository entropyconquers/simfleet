import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The fleet server serves dist/dashboard at "/" and proxies nothing itself, so
// in development Vite forwards /api (HTTP and WebSocket) to the running server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "../dist/dashboard",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8791",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
