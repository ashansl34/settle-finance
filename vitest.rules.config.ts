import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["rules-tests/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
