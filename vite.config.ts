import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const config = defineConfig(({ mode }) => ({
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/history",
      "@tanstack/react-router",
      "@tanstack/react-store",
      "@tanstack/router-core",
      "@tanstack/store",
    ],
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: ["@tanstack/react-store > use-sync-external-store/shim/with-selector"],
  },
  server: {
    headers: { "Service-Worker-Allowed": "/" },
  },
  worker: {
    format: "es",
  },
  environments: {
    ssr: {
      optimizeDeps: {
        include: ["@tanstack/react-store > use-sync-external-store/shim/with-selector"],
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  plugins: [
    ...(mode === "development" ? [devtools()] : []),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/lib/pwa",
      filename: "push-sw.ts",
      outDir: "dist/client",
      scope: "/",
      injectRegister: false,
      registerType: "autoUpdate",
      // The root route links the existing manifest, including share and file handlers.
      manifest: false,
      injectManifest: {
        // Keep the worker's explicit offline-only cache policy.
        injectionPoint: undefined,
      },
      devOptions: { enabled: true, type: "module" },
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
}))

export default config
