import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "integration-tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:test.sqlite",
    },
    globalSetup: "./integration-tests/global-setup.ts",
  },
});
