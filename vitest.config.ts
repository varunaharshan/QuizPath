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
    // src/db/index.ts is guarded with `server-only`, which resolves to a
    // no-op only under the "react-server" export condition (how Next.js's
    // own bundler marks genuine server code). Vitest runs tests through
    // Vite's SSR pipeline, which resolves node_modules packages like
    // `server-only` as externalized deps using `ssr.resolve.externalConditions`
    // rather than the plain `resolve.conditions` above — both need setting.
    conditions: ["react-server"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
      externalConditions: ["react-server"],
    },
  },
});
