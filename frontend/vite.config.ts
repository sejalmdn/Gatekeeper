import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for local development and FastAPI asset output.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/gatekeeper/frontend_dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:8000",
    },
  },
});
