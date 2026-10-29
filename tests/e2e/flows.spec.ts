import { expect, test } from "@playwright/test";
import { login, setDistinctClientIp } from "./helpers";
import { E2E_USERS, SEED } from "./seed-data";

// Flussi principali dal telefono, per ruolo. Ogni test parte da un contesto browser pulito.

test.describe("accesso", () => {
  test("senza sessione si viene mandati alla pagina di accesso", async ({ page }) => {
    await page.goto("/sedi");
    await expect(page).toHaveURL(/\/accedi$/);
  });

  test("una password errata mostra un messaggio chiaro", async ({ page }) => {
    await setDistinctClientIp(page);
    await page.goto("/accedi");
    await page.getByLabel("Email").fill(E2E_USERS.reader.email);
    await page.getByLabel("Password").fill("password-sbagliata-123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByText("Email o password non corretti.")).toBeVisible();
  });

  test("le pagine hanno la CSP e non generano violazioni", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    const response = await page.goto("/accedi");
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await login(page, "admin");
    expect(violations).toEqual([]);
  });
});

test.describe("editor", () => {
  test("aggiunge un libro senza ISBN nella propria sede e lo ritrova con la ricerca", async ({ page }, testInfo) => {
    const title = `Quaderno di ricette ${testInfo.project.name}`;
    await login(page, "editor");
    await page.getByRole("link", { name: "Aggiungi" }).click();
    await page.getByRole("button", { name: /Libro senza ISBN/ }).click();
    await page.getByLabel("Titolo").fill(title);
    await page.getByLabel("Autori (uno per riga)").fill("Nonna Pina");
    await expect(page.getByRole("radio", { name: SEED.casa.name })).toBeChecked();
    await page.getByLabel("Collocazione (facoltativa)").fill("Cucina");
    await page.getByRole("button", { name: "Salva il libro" }).click();

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Cucina")).toBeVisible();

    await page.getByRole("link", { name: "← Catalogo" }).click();
    await page.getByRole("searchbox").fill("ricette pina");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  });

  test("un ISBN già presente propone di aggiungere una copia", async ({ page }) => {
    await login(page, "editor");
    await page.goto("/aggiungi");
    await page.getByLabel("Oppure scrivi l'ISBN").fill("978-88-04-66823-7");
    await page.getByRole("button", { name: "Cerca" }).click();
    await expect(page.getByText("Questo libro è già in catalogo.")).toBeVisible();
    await expect(page.getByText(SEED.book.title)).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Aggiungi una copia" })).toBeVisible();
  });

  test("sposta una copia della propria sede e lo spostamento compare nello storico", async ({ page }, testInfo) => {
    const title = `Atlante ${testInfo.project.name}`;
    await login(page, "editor");
    await page.goto("/aggiungi");
    await page.getByRole("button", { name: /Libro senza ISBN/ }).click();
    await page.getByLabel("Titolo").fill(title);
    await page.getByRole("button", { name: "Salva il libro" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    await page.getByRole("button", { name: "Modifica" }).click();
    await page.locator("label").filter({ hasText: SEED.mare.name }).click();
    await expect(page.getByRole("radio", { name: SEED.mare.name })).toBeChecked();
    await page.getByRole("button", { name: "Sposta" }).click();

    await expect(page.getByText("Copia spostata.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `${SEED.casa.name} → ${SEED.mare.name}` })).toBeVisible();
  });

  test("non può modificare le copie in una sede non sua", async ({ page }) => {
    await login(page, "editor");
    await page.goto(`/libri/${SEED.book.id}`);
    await expect(page.getByText("Veranda")).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifica" })).toHaveCount(0);
  });
});

test.describe("lettore", () => {
  test("consulta e segna come letto, ma non può aggiungere né gestire", async ({ page }) => {
    await login(page, "reader");
    await expect(page.getByRole("link", { name: "Aggiungi" })).toHaveCount(0);

    await page.goto(`/libri/${SEED.book.id}`);
    await expect(page.getByRole("button", { name: "Modifica" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Aggiungi una copia" })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: /Segna come letto|L'ho letto/ });
    if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
    await page.getByRole("button", { name: "Segna come letto" }).click();
    await expect(page.getByRole("button", { name: "L'ho letto" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/aggiungi");
    await expect(page.getByText(/Non ci sono sedi in cui puoi aggiungere libri/)).toBeVisible();

    await page.goto("/sedi");
    await expect(page.getByRole("button", { name: "Crea sede" })).toHaveCount(0);
  });
});

test.describe("amministratore", () => {
  test("crea una sede e la vede nell'elenco", async ({ page }, testInfo) => {
    const name = `Mansarda ${testInfo.project.name}`;
    await login(page, "admin");
    await page.getByRole("link", { name: "Sedi" }).click();
    await page.getByLabel("Nuova sede").fill(name);
    await page.getByRole("button", { name: "Crea sede" }).click();
    await expect(page.getByText("Sede creata.")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  });
});
