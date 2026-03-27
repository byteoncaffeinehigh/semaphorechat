import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port and no open
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5183 }
      : undefined,
    watch: {
      // Don't watch Rust source — Tauri handles that separately
      ignored: ["**/src-tauri/**"],
    },
  },
  // Make sure env vars starting with VITE_ are exposed to the app
  envPrefix: ["VITE_", "TAURI_"],
});
