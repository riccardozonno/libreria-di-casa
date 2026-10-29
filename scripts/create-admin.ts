// Crea un amministratore e stampa il link d'invito monouso (72 h) per impostare la password.
// Sviluppo:   pnpm admin:create --name "Riccardo" --email riccardo@example.com
// Produzione: docker compose run --rm app node dist/create-admin.mjs --name … --email …
import { parseArgs } from "node:util";
import { z } from "zod";
import { writeAudit } from "../src/server/audit";
import { createInviteLink } from "../src/server/auth/invite";
import { normalizeEmail } from "../src/server/auth/lockout";
import { prisma } from "../src/server/db";

const argsSchema = z.object({
  name: z.string().trim().min(1, "--name è obbligatorio").max(100),
  email: z.string().trim().email("--email non valida"),
});

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { name: { type: "string" }, email: { type: "string" } } });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    console.error(parsed.error.issues.map((issue) => issue.message).join("\n"));
    process.exitCode = 1;
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`Esiste già un utente con email ${email}.`);
    process.exitCode = 1;
    return;
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name: parsed.data.name, email, role: "ADMIN" }, select: { id: true } });
    await writeAudit(tx, null, { action: "user.create", entityType: "user", entityId: created.id, data: { email, role: "ADMIN", via: "cli" } });
    return created;
  });
  const link = await createInviteLink(user.id);

  console.log(`Amministratore creato: ${email}`);
  console.log(`Apri questo link entro il ${link.expiresAt.toLocaleString("it-IT")} per impostare la password:`);
  console.log(link.url);
}

main()
  .catch((error: unknown) => {
    console.error("Creazione non riuscita:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
