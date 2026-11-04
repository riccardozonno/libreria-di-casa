import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Due progetti: logica pura in Node (veloce) e API nel runtime Workers con D1/R2 locali e migrazioni vere.
export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      include: ["shared/**/*.ts", "worker/**/*.ts"],
      // Schema dichiarativo di Drizzle: le sue callback (es. `references(() => …)`) servono solo agli
      // strumenti. Il comportamento reale (vincoli, chiavi esterne, FTS, trigger) è in tests/worker/schema.test.ts.
      exclude: ["worker/db/schema.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
                ENVIRONMENT: "test",
                ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
                ACCESS_AUD: "test-audience",
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["tests/worker/**/*.test.ts"],
          setupFiles: ["./tests/worker/apply-migrations.ts"],
        },
      },
    ],
  },
});
