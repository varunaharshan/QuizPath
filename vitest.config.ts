import path from "node:path";
import { defineConfig } from "vitest/config";

// Dedicated test database so integration tests never touch dev seed data.
// Created once via `createdb quizpath_test`; schema is pushed by
// tests/global-setup.ts before the suite runs.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://quizpath:quizpath_dev_pw@localhost:5432/quizpath_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
