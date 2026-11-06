import { cloudflare } from "@cloudflare/vite-plugin"
import posthog from "@posthog/rollup-plugin"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const config = defineConfig(({ command, mode }) => ({
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
    ...(command === "build" && process.env.POSTHOG_PERSONAL_API_KEY
      ? [
          posthog({
            personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
            projectId: "225703",
            host: "https://eu.posthog.com",
            sourcemaps: {
              enabled: true,
              releaseName: "pistonpost",
              releaseVersion: process.env.GITHUB_SHA,
              deleteAfterUpload: true,
            },
          }),
        ]
      : []),
  ],
}))

export default config
