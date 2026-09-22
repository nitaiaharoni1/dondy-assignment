import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:test.sqlite",
    },
    globalSetup: "./tests/global-setup.ts",
  },
});
