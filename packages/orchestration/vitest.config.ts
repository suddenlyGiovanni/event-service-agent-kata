import { defineConfig } from "vitest/config";


export default defineConfig({
  test: {
    name: "orchestration",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
