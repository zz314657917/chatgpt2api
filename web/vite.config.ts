import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const appVersion = process.env.VITE_APP_VERSION || process.env.npm_package_version || "0.0.0-dev";

function vendorChunk(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }
  if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
    return "vendor-react";
  }
  if (/[\\/]node_modules[\\/](motion|framer-motion)[\\/]/.test(id)) {
    return "vendor-motion";
  }
  if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
    return "vendor-icons";
  }
  if (/[\\/]node_modules[\\/](@radix-ui|react-day-picker|react-hook-form|date-fns)[\\/]/.test(id)) {
    return "vendor-ui";
  }
  return "vendor";
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
  },
  build: {
    outDir: "../internal/web/dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});
