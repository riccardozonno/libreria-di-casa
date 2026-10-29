import "server-only";
import { z } from "zod";

// Variabili d'ambiente validate all'avvio: se manca qualcosa l'app non parte (fail fast).

const booleanFlag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve avere almeno 32 caratteri"),
  BETTER_AUTH_URL: z.string().url(),
  REQUIRE_ADMIN_2FA: booleanFlag,
  TRUST_CLOUDFLARE_ONLY: booleanFlag,
  GOOGLE_BOOKS_API_KEY: z.string().default(""),
  COVERS_DIR: z.string().min(1).default("/data/covers"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

// `next build` valuta i moduli senza segreti (che non devono finire nell'immagine):
// solo in quella fase si usano segnaposto. A runtime la validazione resta rigida.
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "build-placeholder-secret-not-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
};

function loadEnv(): Env {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const parsed = envSchema.safeParse(isBuild ? { ...BUILD_PLACEHOLDERS, ...process.env } : process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Configurazione non valida: ${problems}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
