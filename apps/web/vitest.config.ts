import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    // Integration tests share one Postgres database — no parallel files.
    fileParallelism: false,
  },
})
