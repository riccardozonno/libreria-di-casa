import { expect, type Page, test } from "@playwright/test";
import { asUser, EDITOR_LOCATION, USERS } from "./fixtures";

// Fase 3 (MVP) dal telefono: i tre ruoli, una sede, un libro, la scheda, "letto da".

// WebKit scrive questo messaggio per ogni <select>, anche su una pagina vuota con style-src 'self'
// (verificato il 02/11/2026): è il motore, non l'app. Chromium (progetto android) controlla tutto.
const WEBKIT_SELECT_NOISE = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive";

function failOnCspViolation(page: Page) {
  const violations: string[] = [];
  const isWebKit = page.context().browser()?.browserType().name() === "webkit";
  page.on("console", (message) => {
    if (message.type() !== "error" || !/Content Security Policy|Refused to/i.test(message.text())) return;
    if (isWebKit && message.text().startsWith(WEBKIT_SELECT_NOISE)) return;
    violations.push(message.text());
  });
  return violations;
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe("amministratore", () => {
  test.use(asUser("admin"));

  test("crea una sede, aggiunge un libro a mano, lo sta leggendo, lo segna come letto, lo vota e lo trova nel catalogo", async ({ page }) => {
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
    await page.getByLabel("Genere").selectOption({ label: "Narrativa" });
    await page.getByText(sede, { exact: true }).click();
    await page.getByRole("button", { name: "Salva il libro" }).click();

    await expect(page.getByRole("heading", { name: titolo })).toBeVisible();

    // «Sto leggendo», poi «Letto» lo toglie e il tasto sparisce (niente riletture).
    await page.getByRole("button", { name: "Sto leggendo" }).click();
    await expect(page.getByRole("button", { name: "📖 Lo sto leggendo" })).toBeVisible();
    await expect(page.getByText("📖 Sta leggendo:")).toBeVisible();
    await page.getByRole("button", { name: "Segna come letto" }).click();
    await expect(page.getByRole("button", { name: "✓ L'ho letto" })).toBeVisible();
    await expect(page.getByText("📖 Sta leggendo:")).toBeHidden();
    await expect(page.getByRole("button", { name: "Sto leggendo" })).toBeHidden();
    await expect(page.getByRole("button", { name: "📖 Lo sto leggendo" })).toBeHidden();

    // Voto: compare solo dopo «Letto»; ritoccare la stessa stella lo toglie.
    const votes = page.getByRole("group", { name: "Il tuo voto" });
    await votes.getByRole("button", { name: "4 stelle" }).click();
    await expect(page.getByText("Il tuo voto: 4 stelle su 5.", { exact: false })).toBeVisible();
    await expect(page.getByText("· 1 voto")).toBeVisible();
    await votes.getByRole("button", { name: "4 stelle" }).click();
    await expect(page.getByText("Tocca le stelle per votarlo.")).toBeVisible();
    await expect(page.getByText("· 1 voto")).toBeHidden();
    await votes.getByRole("button", { name: "5 stelle" }).click();
    await expect(page.getByText("· 1 voto")).toBeVisible();
    await page.getByRole("button", { name: "✓ L'ho letto" }).click();
    await expect(page.getByRole("group", { name: "Il tuo voto" })).toBeHidden();
    await expect(page.getByText("· 1 voto")).toBeHidden();

    await page.getByRole("link", { name: "← Catalogo" }).click();
    await page.getByLabel("Cerca per titolo, autore o ISBN").fill("perche la citta");
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();

    // Filtro per genere: lo trova in «Narrativa», non in «Storia».
    await page.getByLabel("Genere").selectOption({ label: "Narrativa" });
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
    await page.getByLabel("Genere").selectOption({ label: "Storia" });
    await expect(page.getByText("Nessun libro trovato")).toBeVisible();
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

  test("CSV: scarica il catalogo, controlla un file con errori, poi lo importa corretto", async ({ page }) => {
    const titolo = `Importato ${unique()}`;
    await page.goto("/admin/csv");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Scarica catalogo completo" }).click();
    expect((await download).suggestedFilename()).toMatch(/^catalogo-completo-\d{4}-\d{2}-\d{2}\.csv$/);

    const header = "isbn;titolo;autori;anno;descrizione;sede;collocazione;note";
    const withError = `${header}\n;${titolo};Autrice A | Autore B;1999;;Sede che non esiste;;\n`;
    await page.getByLabel("File CSV").setInputFiles({ name: "libri.csv", mimeType: "text/csv", buffer: Buffer.from(withError) });
    await page.getByRole("button", { name: "Controlla il file" }).click();
    await expect(page.getByText('Riga 2: Sede "Sede che non esiste" inesistente')).toBeVisible();
    await expect(page.getByRole("button", { name: "Importa" })).toBeDisabled();

    const fixed = `${header}\n;${titolo};Autrice A | Autore B;1999;;${EDITOR_LOCATION.name};Scaffale 3;\n`;
    await page.getByLabel("File CSV").setInputFiles({ name: "libri.csv", mimeType: "text/csv", buffer: Buffer.from(fixed) });
    await page.getByRole("button", { name: "Controlla il file" }).click();
    await expect(page.getByText(/1 righe · 1 libri nuovi · 1 copie/)).toBeVisible();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page.getByText("Import completato: 1 libri nuovi · 1 copie")).toBeVisible();

    await page.goto(`/?q=${encodeURIComponent(titolo)}`);
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
  });

  test("nessuna pagina scorre di lato sul telefono", async ({ page }) => {
    for (const path of ["/", "/aggiungi", "/sedi", "/profilo", "/installa", "/admin", "/admin/utenti", "/admin/registro", "/admin/csv"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `pagina ${path}`).toBeLessThanOrEqual(0);
    }
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

    // Il genere lo cambia anche l'editor, per i libri con una copia nella sua sede.
    const titolo = `Libro dell'editor ${unique()}`;
    await page.getByLabel("Titolo").fill(titolo);
    await page.getByText(EDITOR_LOCATION.name, { exact: true }).click();
    await page.getByRole("button", { name: "Salva il libro" }).click();
    await expect(page.getByRole("heading", { name: titolo })).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifica dati" })).toHaveCount(0);
    await page.getByRole("button", { name: "Indica il genere" }).click();
    await page.getByLabel("Genere").selectOption({ label: "Storia" });
    await page.getByRole("button", { name: "Salva il genere" }).click();
    await expect(page.getByText("Genere aggiornato.")).toBeVisible();
    await expect(page.getByText("Storia", { exact: true })).toBeVisible();
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

test("l'icona per la schermata Home è incorporata nella pagina (iOS la cerca senza i cookie di Access)", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<link rel="apple-touch-icon" href="data:image\/png;base64,[A-Za-z0-9+/=]{100,}"/);
});

test("i file statici hanno le intestazioni di sicurezza", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test.describe("app installabile", () => {
  test.use(asUser("reader"));

  test("il service worker si registra e, senza rete, si vede la pagina offline", async ({ page, context, browserName }) => {
    test.skip(browserName === "webkit", "Playwright non gestisce i service worker su WebKit");
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.goto("/sedi").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Sei offline" })).toBeVisible();
    await context.setOffline(false);
  });

  test("dal profilo si arriva alle istruzioni d'installazione", async ({ page }) => {
    await page.goto("/profilo");
    await page.getByRole("link", { name: "Installa l'app sulla schermata Home" }).click();
    await expect(page.getByRole("heading", { name: "Installa l'app" })).toBeVisible();
    await expect(page.getByText("Aggiungi alla schermata Home").first()).toBeVisible();
  });
});
