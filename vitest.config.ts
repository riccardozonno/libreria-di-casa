import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_ENV } from "./tests/integration/env";

// Due progetti: unit (funzioni pure, veloci) e integration (Postgres di test su 127.0.0.1:5433).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" lancia un errore fuori dal bundle React Server: nei test basta un modulo vuoto.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          env: { ...TEST_ENV },
          globalSetup: ["tests/integration/global-setup.ts"],
          // Un solo DB condiviso: niente esecuzione parallela tra file.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/server/**", "src/lib/**"],
      exclude: ["src/generated/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
