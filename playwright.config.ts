import { defineConfig, devices } from "@playwright/test";
import { E2E_STATE } from "./tests/e2e/fixtures";

// E2E sulla build vera (vite preview: Worker + file statici con le intestazioni di _headers),
// D1 locale separato e identità di sviluppo (X-Dev-Identity). Telefoni: iPhone e Android.
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node tests/e2e/reset-db.ts && pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { E2E_STATE },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
