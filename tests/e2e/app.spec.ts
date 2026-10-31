import { expect, type Page, test } from "@playwright/test";
import { asUser, EDITOR_LOCATION, USERS } from "./fixtures";

// Fase 3 (MVP) dal telefono: i tre ruoli, una sede, un libro, la scheda, "letto da".

function failOnCspViolation(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe("amministratore", () => {
  test.use(asUser("admin"));

  test("crea una sede, aggiunge un libro a mano, lo trova nel catalogo e lo segna come letto", async ({ page }) => {
    const violations = failOnCspViolation(page);
    const sede = `Sede ${unique()}`;
    const titolo = `Perché la città ${unique()}`;

    await page.goto("/sedi");
    await page.getByLabel("Nuova sede").fill(sede);
    await page.getByRole("button", { name: "Crea sede" }).click();
    await expect(page.getByText("Sede creata.")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(sede) })).toBeVisible();

    await page.getByRole("link", { name: "Aggiungi" }).click();
    await page.getByRole("button", { name: "Libro senza ISBN: inserisci a mano" }).click();
    await page.getByLabel("Titolo").fill(titolo);
    await page.getByLabel("Autori (uno per riga)").fill("Niccolò Ammaniti");
    await page.getByText(sede, { exact: true }).click();
    await page.getByRole("button", { name: "Salva il libro" }).click();

    await expect(page.getByRole("heading", { name: titolo })).toBeVisible();
    await page.getByRole("button", { name: "Segna come letto" }).click();
    await expect(page.getByRole("button", { name: "✓ L'ho letto" })).toBeVisible();

    await page.getByRole("link", { name: "← Catalogo" }).click();
    await page.getByLabel("Cerca per titolo, autore o ISBN").fill("perche la citta");
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("vede l'area admin e l'elenco utenti", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Admin" }).click();
    await page.getByRole("link", { name: /Utenti/ }).click();
    await expect(page.getByText(USERS.editor.email)).toBeVisible();
    await expect(page.getByText(USERS.reader.email)).toBeVisible();
  });

  test("consulta il registro attività filtrato per categoria", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("link", { name: /Registro attività/ }).click();
    await page.getByRole("button", { name: "Sedi" }).click();
    await expect(page).toHaveURL(/category=location/);
    await expect(page.getByText(/ha creato una sede/).first()).toBeVisible();
  });

  test("aggiunge una persona e riceve il messaggio d'invito da mandarle (l'app non spedisce email)", async ({ page }) => {
    const email = `nuova-${unique()}@e2e.test`;
    await page.goto("/admin/utenti");
    await page.getByLabel("Nome").last().fill("Nuova persona");
    await page.getByLabel(/^Email/).fill(email);
    await page.getByRole("button", { name: "Aggiungi utente" }).click();
    await expect(page.getByText("Ora avvisa Nuova persona")).toBeVisible();
    await expect(page.getByText(new RegExp(`Scrivi la tua email \\(${email.replace(/[.]/g, "\\.")}\\)`))).toBeVisible();
    await expect(page.getByRole("button", { name: "Condividi l'invito" })).toBeVisible();
  });
});

test.describe("editor", () => {
  test.use(asUser("editor"));

  test("aggiunge libri solo nella propria sede e non vede l'area admin", async ({ page }) => {
    await page.goto("/aggiungi");
    await page.getByRole("button", { name: "Libro senza ISBN: inserisci a mano" }).click();
    await expect(page.getByText(EDITOR_LOCATION.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await page.goto("/admin/utenti");
    await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
  });
});

test.describe("lettore", () => {
  test.use(asUser("reader"));

  test("consulta soltanto: niente 'Aggiungi', niente modifiche alle copie", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aggiungi" })).toHaveCount(0);
    await page.goto("/aggiungi");
    await expect(page.getByText("Non sei editor di nessuna sede attiva")).toBeVisible();
  });

  test("le scritture dirette all'API sono rifiutate", async ({ page }) => {
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Abusiva", color: "ROSA" }) });
      return response.status;
    });
    expect(status).toBe(403);
  });
});

test("i file statici hanno le intestazioni di sicurezza", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
