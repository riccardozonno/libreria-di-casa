import { describe, expect, it } from "vitest";
import { buildCreateAdminSql } from "../../scripts/create-admin-sql.mjs";

// Lo script del primo amministratore genera SQL: gli input vanno validati e mai interpolati grezzi.

const ids = { userId: "11111111-1111-4111-8111-111111111111", auditId: "22222222-2222-4222-8222-222222222222" };

describe("buildCreateAdminSql", () => {
  it("crea l'utente ADMIN (email in minuscolo) e la riga di registro", () => {
    const sql = buildCreateAdminSql({ email: " Riccardo@Example.com ", name: "Riccardo" }, ids);
    expect(sql).toContain(`INSERT INTO user (id, email, name, role, active) VALUES ('${ids.userId}', 'riccardo@example.com', 'Riccardo', 'ADMIN', 1);`);
    expect(sql).toContain(`INSERT INTO audit_log (id, action, entity_type, entity_id, data) VALUES ('${ids.auditId}', 'user.create', 'user', '${ids.userId}', '{"role":"ADMIN","via":"cli"}');`);
  });

  it("raddoppia gli apici nel nome (niente SQL iniettato)", () => {
    const sql = buildCreateAdminSql({ email: "a@example.com", name: "D'Annunzio'); DROP TABLE user; --" }, ids);
    expect(sql).toContain("'D''Annunzio''); DROP TABLE user; --'");
    expect(sql.split(";\n").filter((statement) => statement.trim() !== "")).toHaveLength(2);
  });

  it.each(["", "senza-chiocciola", "a@b", "spazi @example.com", "x'@example.com"])("rifiuta l'email non valida %j", (email) => {
    expect(() => buildCreateAdminSql({ email, name: "Riccardo" }, ids)).toThrow(/email/i);
  });

  it("rifiuta un nome vuoto o troppo lungo", () => {
    expect(() => buildCreateAdminSql({ email: "a@example.com", name: "  " }, ids)).toThrow(/nome/i);
    expect(() => buildCreateAdminSql({ email: "a@example.com", name: "x".repeat(81) }, ids)).toThrow(/nome/i);
  });
});
