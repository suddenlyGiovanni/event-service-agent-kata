import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
