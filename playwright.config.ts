import { defineConfig, devices } from "@playwright/test";
import { TEST_APP_URL } from "./tests/integration/env";

// E2E sui flussi principali, contro la build di produzione e il database di test (compose.dev.yaml: db-test).
// Il lookup ISBN verso Google/Open Library non viene chiamato: è coperto dai test unitari con fetch simulato.

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "it-IT",
  },
  projects: [
    { name: "iphone-webkit", use: { ...devices["iPhone 15"] } },
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start -H 127.0.0.1 -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_APP_URL,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      BETTER_AUTH_URL: BASE_URL,
      COVERS_DIR: "./data/e2e-covers",
      GOOGLE_BOOKS_API_KEY: "",
      REQUIRE_ADMIN_2FA: "false",
      TRUST_CLOUDFLARE_ONLY: "false",
    },
  },
});
