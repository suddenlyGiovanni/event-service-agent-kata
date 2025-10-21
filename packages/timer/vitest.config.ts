import { defineConfig } from "vitest/config";


export default defineConfig({
  test: {
    name: "timer",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  }
});
