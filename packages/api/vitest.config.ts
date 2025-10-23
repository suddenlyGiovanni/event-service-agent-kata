import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
