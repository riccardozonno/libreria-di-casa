import type { Context } from "hono";
import type { z } from "zod";
import type { AuditActor } from "./audit";
import type { AppEnv } from "./env";
import { DomainError } from "./errors";

// Utilità comuni delle rotte: corpo JSON validato con zod, chi sta agendo.

export async function readBody<Schema extends z.ZodType>(c: Context<AppEnv>, schema: Schema): Promise<z.output<Schema>> {
  const raw: unknown = await c.req.json().catch(() => {
    throw new DomainError("VALIDATION", "Il corpo della richiesta non è JSON valido.");
  });
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??= issue.message;
  }
  throw new DomainError("VALIDATION", "Dati non validi.", fields);
}

export interface Requester {
  actor: AppEnv["Variables"]["actor"];
  audit: AuditActor & { ip: string | null };
}

export function requester(c: Context<AppEnv>): Requester {
  const user = c.get("user");
  return { actor: c.get("actor"), audit: { id: user.id, email: user.email, ip: c.req.header("CF-Connecting-IP") ?? null } };
}
