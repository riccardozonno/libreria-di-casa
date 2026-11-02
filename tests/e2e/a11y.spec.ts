import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { asUser, EDITOR_LOCATION } from "./fixtures";

// Accessibilità (WCAG 2.2 A/AA) con axe, in modalità chiara e scura: nessuna violazione seria o critica.

const PAGES = ["/", "/?genere=NONE", "/aggiungi", "/sedi", "/profilo", "/installa", "/admin", "/admin/utenti", "/admin/registro", "/admin/csv"];

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibilità (${colorScheme === "light" ? "chiaro" : "scuro"})`, () => {
    test.use({ ...asUser("admin"), colorScheme });

    for (const path of PAGES) {
      test(`pagina ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await seriousViolations(page)).toEqual([]);
      });
    }

    test("scheda libro e modulo di aggiunta aperto", async ({ page }) => {
      const origin = new URL(String(test.info().project.use.baseURL)).origin;
      const created = await page.request.post("/api/books", {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { book: { title: `Accessibile ${Date.now()}`, authors: ["Autrice"] }, source: "MANUAL", locationId: EDITOR_LOCATION.id, copy: { shelf: "Studio" } },
      });
      expect(created.status()).toBe(201);
      const { bookId } = (await created.json()) as { bookId: string };
      await page.goto(`/libri/${bookId}`);
      await expect(page.getByRole("heading", { level: 1, name: /^Accessibile/ })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Con il modulo del genere aperto.
      await page.getByRole("button", { name: "Indica il genere" }).click();
      await expect(page.getByRole("button", { name: "Salva il genere" })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Annulla" }).click();

      // Con «Sto leggendo» attivo.
      await page.getByRole("button", { name: "Sto leggendo" }).click();
      await expect(page.getByText("📖 Sta leggendo:")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Con le stelle del voto visibili (dopo «Letto») e un voto dato.
      await page.getByRole("button", { name: "Segna come letto" }).click();
      await page.getByRole("group", { name: "Il tuo voto" }).getByRole("button", { name: "3 stelle" }).click();
      await expect(page.getByText("· 1 voto")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await page.goto("/aggiungi");
      await page.getByRole("button", { name: "Libro senza ISBN: inserisci a mano" }).click();
      await expect(page.getByLabel("Titolo")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
