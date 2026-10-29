import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { SEED } from "./seed-data";

// Flussi di amministrazione (fase 3): utenti, CSV, registro attività, PWA.

test.describe("amministratore", () => {
  test("crea un utente editor e ottiene il link d'invito", async ({ page }, testInfo) => {
    await login(page, "admin");
    await page.getByRole("link", { name: "Admin" }).click();
    await page.getByRole("link", { name: /Utenti/ }).click();

    const email = `nuovo-${testInfo.project.name}@e2e.test`;
    await page.getByLabel("Nome").last().fill("Nuovo Editor");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("radio", { name: "Editor" }).last().check();
    await page.getByLabel(SEED.casa.name).last().check();
    await page.getByRole("button", { name: "Crea utente e link d'invito" }).click();

    await expect(page.getByText("Link d'invito", { exact: true })).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "/imposta-password?token=" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test("esporta il CSV e controlla un import con errori senza scrivere nulla", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/csv");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Scarica tutto il catalogo" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^home-library-\d{4}-\d{2}-\d{2}\.csv$/);

    await page.getByLabel("File CSV").setInputFiles({
      name: "prova.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("isbn;titolo;sede\n;Libro buono;Casa\n123;Libro cattivo;Casa\n"),
    });
    await page.getByRole("button", { name: "Controlla il file" }).click();
    await expect(page.getByText("Riga 3: ISBN non valido: 123")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importa" })).toBeDisabled();
  });

  test("consulta il registro attività con gli accessi", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/registro?categoria=auth");
    await expect(page.getByText("ha effettuato l'accesso").first()).toBeVisible();
  });
});

test.describe("altri ruoli", () => {
  test("l'area admin non è accessibile all'editor", async ({ page }) => {
    await login(page, "editor");
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await page.goto("/admin/utenti");
    await expect(page.getByText("Questa sezione è riservata all'amministratore.")).toBeVisible();
    const response = await page.request.get("/api/export");
    expect(response.status()).toBe(403);
  });
});

test("la PWA espone manifest e icone", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "HOME LIBRARY", display: "standalone", lang: "it" });
  expect((await request.get("/icons/icon-512.png")).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
});
