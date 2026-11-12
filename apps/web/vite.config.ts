import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Split large vendor libraries into separate chunks to keep the main bundle
         * under the 500 kB Rollup warning threshold.
         *
         * ag-studio / ag-grid are the dominant contributors to the ChaosAnalytics
         * chunk size (~4.6 MB unminified). Isolating them lets the browser cache
         * them independently between deploys.
         */
        manualChunks(id) {
          if (id.includes("node_modules/ag-studio") || id.includes("node_modules/ag-studio-react")) {
            return "vendor-ag-studio"
          }
          if (id.includes("node_modules/ag-grid")) {
            return "vendor-ag-grid"
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react"
          }
        },
      },
    },
  },
})
