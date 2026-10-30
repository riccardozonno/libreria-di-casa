import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

// Fase 2: l'app si apre sul telefono, riconosce l'utente e rispetta la CSP (nessuna violazione).

test("mostra chi è entrato e con quale ruolo", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) cspViolations.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HOME LIBRARY" })).toBeVisible();
  await expect(page.getByText(`Ciao ${E2E_ADMIN.name}`)).toBeVisible();
  await expect(page.getByText(`Amministratore · ${E2E_ADMIN.email}`)).toBeVisible();
  expect(cspViolations).toEqual([]);
});

test("le pagine interne aprono comunque l'app (navigazione a pagina singola)", async ({ page }) => {
  const response = await page.goto("/libri/qualsiasi");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "HOME LIBRARY" })).toBeVisible();
});

test("i file statici hanno le intestazioni di sicurezza", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
