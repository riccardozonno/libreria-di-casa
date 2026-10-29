// Credenziali del solo database di test usa e getta (compose.dev.yaml, tmpfs). Non sono segreti.
export const TEST_MIGRATION_URL = "postgresql://migrator:test-only-password@127.0.0.1:5433/homelibrary_test";
export const TEST_APP_URL = "postgresql://app:test-only-app-password@127.0.0.1:5433/homelibrary_test";

export const TEST_ENV = {
  DATABASE_URL: TEST_APP_URL,
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
  BETTER_AUTH_URL: "http://localhost:3000",
  REQUIRE_ADMIN_2FA: "false",
  TRUST_CLOUDFLARE_ONLY: "false",
  GOOGLE_BOOKS_API_KEY: "",
  COVERS_DIR: "./data/test-covers",
} as const;
