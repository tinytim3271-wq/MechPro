import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import hercules from "@usehercules/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useAws =
    env.VITE_USE_AWS === "true" ||
    // Pointing VITE_CONVEX_URL at an HTTP(S) API Gateway URL (not *.convex.cloud)
    // is the cutover signal documented in aws/env.example.
    Boolean(
      env.VITE_CONVEX_URL &&
        /^https?:\/\//.test(env.VITE_CONVEX_URL) &&
        !env.VITE_CONVEX_URL.includes(".convex.cloud") &&
        !env.VITE_CONVEX_URL.includes("localhost:3"),
    );

  return {
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), tailwindcss(), ...(useAws ? [] : [hercules()])],
    define: {
      "import.meta.env.VITE_USE_AWS": JSON.stringify(useAws ? "true" : "false"),
    },
    resolve: {
      alias: {
        "@/convex": path.resolve(__dirname, "./convex"),
        "@": path.resolve(__dirname, "./src"),
        ...(useAws
          ? {
              "convex/react": path.resolve(__dirname, "./src/lib/aws-convex/react.tsx"),
            }
          : {}),
      },
    },
  };
});
