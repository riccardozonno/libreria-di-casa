// SQL per creare il primo amministratore (usato da scripts/create-admin.mjs).
// `wrangler d1 execute` non accetta parametri: gli input sono validati e gli apici raddoppiati.

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const MAX_NAME_LENGTH = 80;

const quote = (value) => `'${value.replaceAll("'", "''")}'`;

/**
 * @param {{ email: string, name: string }} input
 * @param {{ userId: string, auditId: string }} ids
 * @returns {string}
 */
export function buildCreateAdminSql(input, ids) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`Email non valida: ${JSON.stringify(input.email)}`);
  // Niente caratteri di controllo (a capo compreso) nel nome.
  const name = input.name.replace(/\p{Cc}/gu, " ").trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) throw new Error(`Il nome deve avere da 1 a ${MAX_NAME_LENGTH} caratteri.`);

  const data = JSON.stringify({ role: "ADMIN", via: "cli" });
  return [
    `INSERT INTO user (id, email, name, role, active) VALUES (${quote(ids.userId)}, ${quote(email)}, ${quote(name)}, 'ADMIN', 1);`,
    `INSERT INTO audit_log (id, action, entity_type, entity_id, data) VALUES (${quote(ids.auditId)}, 'user.create', 'user', ${quote(ids.userId)}, ${quote(data)});`,
    "",
  ].join("\n");
}
