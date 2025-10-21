import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "adapters",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
