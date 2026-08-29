import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import hercules from "@usehercules/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    hmr: { overlay: false },
  },
  build: {
    sourcemap: false,
  },
  plugins: [
    react(),
    tailwindcss(),
    hercules(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon/icon-192.png", "icon/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@/convex": path.resolve(__dirname, "./convex"),
      "@": path.resolve(__dirname, "./src"),
      ...(process.env.VITE_USE_AWS === "true"
        ? { "convex/react": path.resolve(__dirname, "./src/lib/aws-convex/react.tsx") }
        : {}),
    },
  },
});
