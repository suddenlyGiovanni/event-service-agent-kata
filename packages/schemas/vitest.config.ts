import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "schemas",
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"]
  }
});
