import { expect, type Page, test } from "@playwright/test";
import { asUser, EDITOR_LOCATION, SCROLL_BOOKS, USERS } from "./fixtures";

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

    // Selettore di stato: parte da «Da leggere»; la famiglia non ha ancora nessuno.
    const status = page.getByRole("group", { name: "Il tuo stato" });
    const option = (name: string) => status.getByRole("button", { name, exact: true });
    await expect(option("Da leggere")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Nessuno l'ha ancora letto o iniziato")).toBeVisible();

    // «Sto leggendo»: il riepilogo (chiuso) lo conta; aperto mostra il gruppo.
    await option("Sto leggendo").click();
    await expect(option("Sto leggendo")).toHaveAttribute("aria-pressed", "true");
    const family = page.getByRole("button", { name: /In famiglia/ });
    await expect(family).toHaveAttribute("aria-expanded", "false");
    await expect(family).toContainText("1 in lettura");
    await family.click();
    await expect(family).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Lo stanno leggendo · 1" })).toBeVisible();

    // «Letto»: toglie «Sto leggendo» e fa comparire il tuo voto sotto il selettore.
    await option("Letto").click();
    await expect(option("Letto")).toHaveAttribute("aria-pressed", "true");
    await expect(family).toContainText("1 letto");
    await expect(page.getByRole("heading", { name: "L'hanno letto · 1" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Lo stanno leggendo/ })).toBeHidden();

    // Voto: ritoccare la stessa stella lo toglie; la media compare nel riepilogo.
    const votes = page.getByRole("group", { name: "Il tuo voto" });
    await votes.getByRole("button", { name: "4 stelle" }).click();
    await expect(page.getByText("Il tuo voto: 4 stelle su 5.", { exact: false })).toBeVisible();
    await expect(family).toContainText("4 · 1 letto");
    await votes.getByRole("button", { name: "4 stelle" }).click();
    await expect(page.getByText("Tocca le stelle per votarlo.")).toBeVisible();
    await expect(family).not.toContainText("4 ·");
    await votes.getByRole("button", { name: "5 stelle" }).click();
    await expect(family).toContainText("5 · 1 letto");

    // Togliere «letto» chiede conferma: «Annulla» lascia tutto com'era.
    await option("Da leggere").click();
    await expect(page.getByText("Togliere «letto»? Il tuo voto si perde.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Annulla" })).toBeFocused();
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(option("Letto")).toHaveAttribute("aria-pressed", "true");
    await expect(option("Da leggere")).toBeFocused();
    await expect(family).toContainText("5 · 1 letto");
    await option("Da leggere").click();
    await page.getByRole("button", { name: "Togli «letto»" }).click();
    await expect(option("Da leggere")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Il tuo voto" })).toBeHidden();
    await expect(page.getByText("Nessuno l'ha ancora letto o iniziato")).toBeVisible();

    await page.getByRole("link", { name: "← Catalogo" }).click();
    await page.getByLabel("Cerca per titolo, autore o ISBN").fill("perche la citta");
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();

    // Filtro per genere: lo trova in «Narrativa», non in «Storia».
    await page.getByLabel("Genere").selectOption({ label: "Narrativa" });
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
    await page.getByLabel("Genere").selectOption({ label: "Storia" });
    await expect(page.getByText("Nessun libro trovato")).toBeVisible();
    await page.getByLabel("Genere").selectOption({ label: "Tutti i generi" });

    // Filtri di lettura: «Letto» è stato tolto e non lo sta più leggendo.
    await page.getByLabel("Lettura").selectOption({ label: "Non letti da me" });
    await expect(page).toHaveURL(/lettura=UNREAD_BY_ME/);
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
    await page.getByLabel("Lettura").selectOption({ label: "In lettura" });
    await expect(page.getByText("Nessun libro trovato")).toBeVisible();
    await page.getByLabel("Lettura").selectOption({ label: "Non letti da nessuno" });
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
    await page.getByLabel("Lettura").selectOption({ label: "Tutti i libri" });
    await expect(page).not.toHaveURL(/lettura=/);
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
    for (const path of ["/", "/statistiche", "/aggiungi", "/sedi", "/profilo", "/installa", "/admin", "/admin/utenti", "/admin/registro", "/admin/csv"]) {
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

    // I dati del libro (genere compreso) li modifica anche l'editor, per i libri con una copia nella sua sede.
    const titolo = `Libro dell'editor ${unique()}`;
    await page.getByLabel("Titolo").fill(titolo);
    await page.getByText(EDITOR_LOCATION.name, { exact: true }).click();
    await page.getByRole("button", { name: "Salva il libro" }).click();
    await expect(page.getByRole("heading", { name: titolo })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cambia genere" })).toHaveCount(0);
    const edit = page.getByRole("button", { name: "Modifica dati" });
    await edit.click();
    await expect(page.getByLabel("Titolo")).toBeFocused();
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(edit).toBeFocused();
    await edit.click();
    await page.getByLabel("Genere").selectOption({ label: "Storia" });
    await page.getByLabel("Anno").fill("1999");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Dati del libro aggiornati.")).toBeVisible();
    await expect(page.getByText("Storia", { exact: true })).toBeVisible();
    await expect(page.getByText("1999", { exact: true })).toBeVisible();
    await expect(edit).toBeFocused();

    // Filtri sconosciuti nell'indirizzo si ignorano (niente errore).
    await page.goto("/?genere=ROSA&lettura=XYZ");
    await expect(page.getByLabel("Genere")).toHaveValue("");
    await expect(page.getByLabel("Lettura")).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();

    // L'editor non l'ha letto: lo trova tra i suoi «non letti».
    await page.goto(`/?lettura=UNREAD_BY_ME&q=${encodeURIComponent(titolo)}`);
    await expect(page.getByLabel("Lettura")).toHaveValue("UNREAD_BY_ME");
    await expect(page.getByRole("link", { name: new RegExp(titolo) })).toBeVisible();
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

  test("apre le Statistiche dal Catalogo", async ({ page }) => {
    const violations = failOnCspViolation(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Statistiche" }).click();
    await expect(page).toHaveURL(/\/statistiche$/);
    await expect(page.getByRole("heading", { level: 1, name: "Statistiche" })).toBeVisible();
    for (const title of ["Chi legge di più", "Sta leggendo", "Letture per mese", "Letture per anno", "I più apprezzati", "Autori più letti", "Generi più letti", "Letture in comune"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    // Sempre 12 mesi, anche a zero.
    await expect(page.getByRole("list", { name: "Letture per mese" }).getByRole("listitem")).toHaveCount(12);
    await page.getByRole("link", { name: "← Catalogo" }).click();
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
    expect(violations).toEqual([]);
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

test.describe("catalogo a scorrimento continuo", () => {
  test.use(asUser("editor"));

  test("si scorre fino in fondo, il contatore segue e tornando dalla scheda lista e posizione restano", async ({ page }) => {
    const word = SCROLL_BOOKS.word;
    await page.goto(`/?q=${word}`);
    const books = page.getByRole("link", { name: new RegExp(word) });
    await expect(books).toHaveCount(24);
    await expect(page.getByText("24 di 30 libri")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pagine" })).toHaveCount(0);

    // Arrivando in fondo arrivano da soli gli altri 6.
    await page.getByText("24 di 30 libri").scrollIntoViewIfNeeded();
    await expect(books).toHaveCount(30);
    await expect(page.getByText("30 libri", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mostra altri" })).toHaveCount(0);

    // Apro il 28° e torno indietro: stessi 30 libri, e il 28° è ancora sullo schermo.
    await page.getByRole("link", { name: new RegExp(`${word} 28`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: `${word} 28` })).toBeVisible();
    await page.goBack();
    await expect(books).toHaveCount(30);
    await expect(page.getByRole("link", { name: new RegExp(`${word} 28`) })).toBeInViewport();
  });

  test("anche con il link «← Catalogo» della scheda (l'app sulla schermata Home non ha il tasto indietro)", async ({ page }) => {
    const word = SCROLL_BOOKS.word;
    await page.goto(`/?q=${word}`);
    const books = page.getByRole("link", { name: new RegExp(word) });
    await page.getByText("24 di 30 libri").scrollIntoViewIfNeeded();
    await expect(books).toHaveCount(30);
    await page.getByRole("link", { name: new RegExp(`${word} 28`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: `${word} 28` })).toBeVisible();
    // Un cambio di stato di lettura nella scheda (scrittura) non deve far perdere la lista. Andata e ritorno
    // a «Da leggere», così il test si ripete uguale su entrambi i browser.
    const status = page.getByRole("group", { name: "Il tuo stato" });
    await status.getByRole("button", { name: "Sto leggendo", exact: true }).click();
    await expect(status.getByRole("button", { name: "Sto leggendo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await status.getByRole("button", { name: "Da leggere", exact: true }).click();
    await expect(status.getByRole("button", { name: "Da leggere", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "← Catalogo" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${word}$`));
    await expect(page.getByLabel("Cerca per titolo, autore o ISBN")).toHaveValue(word);
    await expect(books).toHaveCount(30);
    await expect(page.getByRole("link", { name: new RegExp(`${word} 28`) })).toBeInViewport();
  });

  test.describe("rete che non risponde", () => {
    // Con il service worker attivo WebKit fa passare la richiesta da lì e page.route non la vede.
    test.use({ serviceWorkers: "block" });

    test("se il caricamento automatico non va, c'è «Mostra altri»", async ({ page }) => {
      const word = SCROLL_BOOKS.word;
      // Il secondo blocco fallisce una volta (rete assente).
      await page.route(/\/api\/books\?.*page=1/, (route) => route.abort(), { times: 1 });
      await page.goto(`/?q=${word}`);
      const books = page.getByRole("link", { name: new RegExp(word) });
      await expect(books).toHaveCount(24);
      await page.getByText("24 di 30 libri").scrollIntoViewIfNeeded();
      await expect(page.getByRole("alert")).toBeVisible();
      await page.getByRole("button", { name: "Mostra altri" }).click();
      await expect(books).toHaveCount(30);
      await expect(page.getByRole("alert")).toHaveCount(0);
      // Il tasto non c'è più (tutti caricati): il focus è sul primo libro arrivato, non perso in cima.
      await expect(page.getByRole("link", { name: new RegExp(`${word} 25`) })).toBeFocused();
    });
  });
});

test.describe("dopo una pubblicazione", () => {
  test.use(asUser("reader"));

  test("un file JS che non esiste più (vecchio hash) fa ricaricare la pagina una volta sola", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
    let loads = 0;
    page.on("load", () => (loads += 1));
    const preloadError = () => page.evaluate(() => window.dispatchEvent(new Event("vite:preloadError", { cancelable: true })));

    await preloadError();
    await expect.poll(() => loads).toBe(1);
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();

    // Subito dopo, un altro errore non ricarica di nuovo (niente cicli se il file manca davvero).
    await preloadError();
    await page.waitForTimeout(1_000);
    expect(loads).toBe(1);
  });
});

test.describe("dopo una pubblicazione (file vero mancante)", () => {
  // Il service worker inoltrerebbe la richiesta senza passare da page.route: qui lo si blocca.
  test.use({ ...asUser("reader"), serviceWorkers: "block" });

  test("le Statistiche con il vecchio file: niente pagina d'errore, la pagina si ricarica e si aprono", async ({ page, browserName }) => {
    // In un Deploy vero, dopo la ricarica il file ha un nome nuovo. Qui il nome resta lo stesso e WebKit
    // ripresenta l'errore per quell'indirizzo anche dopo la ricarica (verificato il 04/11/2026): il percorso
    // reale si prova su Chromium; la ricarica una sola volta è provata su entrambi dal test con l'evento.
    test.skip(browserName === "webkit", "WebKit ricorda l'errore per lo stesso indirizzo dopo la ricarica");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
    // Come dopo un Deploy: il vecchio file non esiste e Cloudflare risponde con la pagina HTML (200).
    const html = await (await page.request.get("/")).text();
    await page.route("**/assets/stats-*.js", (route) => route.fulfill({ status: 200, contentType: "text/html", headers: { "Cache-Control": "no-store" }, body: html }), {
      times: 1,
    });
    // no-store: dopo un vero Deploy la pagina ricaricata chiede un file con un nome nuovo; qui il nome resta
    // lo stesso, e senza no-store Safari riuserebbe la risposta finta tenuta in cache.
    // Annota se la pagina d'errore compare anche per un istante (sessionStorage sopravvive alla ricarica).
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.body?.textContent?.includes("Qualcosa è andato storto")) sessionStorage.setItem("e2e-error-page", "1");
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
    let loads = 0;
    page.on("load", () => (loads += 1));

    await page.getByRole("link", { name: "Statistiche" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Statistiche" })).toBeVisible();
    expect(loads).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem("e2e-error-page"))).toBeNull();
  });
});

test("i file statici hanno le intestazioni di sicurezza", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("le pagine non restano in cache (una nuova versione si vede subito); i file con hash sì", async ({ request }) => {
  for (const path of ["/", "/statistiche"]) {
    expect((await request.get(path)).headers()["cache-control"]).toBe("no-store");
  }
  const html = await (await request.get("/")).text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(script).toBeDefined();
  expect((await request.get(script!)).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect((await request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");
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
