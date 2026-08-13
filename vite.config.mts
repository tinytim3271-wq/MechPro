import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useAwsBackend = env.VITE_USE_AWS === 'true';

  return {
    base: "/",
    resolve: {
      alias: [
        ...(useAwsBackend
          ? [{
              find: /^convex\/react$/,
              replacement: fileURLToPath(new URL('./src/lib/aws-convex/react.tsx', import.meta.url)),
            }]
          : []),
        { find: /^@\/convex\/(.*)$/, replacement: fileURLToPath(new URL('./convex/$1', import.meta.url)) },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    build: {
      sourcemap: true,
      assetsDir: "code",
      target: ["esnext"],
      cssMinify: true,
      lib: false,
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "injectManifest",
        injectManifest: {
          swSrc: 'public/sw.js',
          swDest: 'dist/sw.js',
          globDirectory: 'dist',
          globPatterns: [
            '**/*.{html,js,css,json,png}',
          ],
        },
        injectRegister: false,
        manifest: false,
        devOptions: {
          enabled: true,
        },
      }),
    ],
  };
});
