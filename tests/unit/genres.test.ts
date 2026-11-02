import { describe, expect, it } from "vitest";
import { genreFromText, genreLabel, GENRE_KEYS, GENRES, suggestGenre } from "../../shared/genres";

// Elenco dei generi (approvato il 02/11/2026) e suggerimento dalle categorie di Google Books.

describe("elenco dei generi", () => {
  it("22 generi, chiavi ed etichette uniche, «Altro» per ultimo", () => {
    expect(GENRES).toHaveLength(22);
    expect(new Set(GENRE_KEYS).size).toBe(22);
    expect(new Set(GENRES.map((genre) => genre.label)).size).toBe(22);
    expect(GENRES.at(-1)).toEqual({ key: "ALTRO", label: "Altro" });
  });

  it("etichette in italiano", () => {
    expect(genreLabel("ROMANZO")).toBe("Romanzo");
    expect(genreLabel("BIOGRAFIA")).toBe("Biografia");
    expect(genreLabel("LINGUE")).toBe("Lingue e critica letteraria");
  });
});

describe("suggerimento da Google Books", () => {
  it.each([
    [["Fiction"], "NARRATIVA"],
    [["Literary Collections"], "NARRATIVA"],
    [["Fiction / Mystery & Detective / General"], "GIALLI"],
    [["Fiction / Thrillers / Suspense"], "GIALLI"],
    [["True Crime"], "GIALLI"],
    [["Fiction / Fantasy / Epic"], "FANTASY"],
    [["Fiction / Science Fiction / General"], "FANTASY"],
    [["Fiction / Romance / Contemporary"], "ROMANZO"],
    [["Fiction / Classics"], "CLASSICI"],
    [["Poetry"], "POESIA"],
    [["Drama"], "POESIA"],
    [["Juvenile Fiction"], "RAGAZZI"],
    [["Young Adult Nonfiction"], "RAGAZZI"],
    [["Comics & Graphic Novels"], "FUMETTI"],
    [["Biography & Autobiography"], "BIOGRAFIA"],
    [["History"], "STORIA"],
    [["Philosophy"], "FILOSOFIA"],
    [["Psychology"], "PSICOLOGIA"],
    [["Education"], "PSICOLOGIA"],
    [["Religion"], "RELIGIONE"],
    [["Body, Mind & Spirit"], "RELIGIONE"],
    [["Political Science"], "SOCIETA"],
    [["Social Science"], "SOCIETA"],
    [["Law"], "SOCIETA"],
    [["Business & Economics"], "ECONOMIA"],
    [["Literary Criticism"], "LINGUE"],
    [["Foreign Language Study"], "LINGUE"],
    [["Science"], "SCIENZA"],
    [["Medical"], "SCIENZA"],
    [["Art"], "ARTE"],
    [["Music"], "ARTE"],
    [["Travel"], "VIAGGI"],
    [["Cooking"], "CUCINA"],
    [["Self-Help"], "TEMPO_LIBERO"],
    [["Gardening"], "TEMPO_LIBERO"],
  ])("%j → %s", (categories, expected) => {
    expect(suggestGenre(categories)).toBe(expected);
  });

  it("la sottocategoria vince sulla categoria; conta solo la prima categoria", () => {
    expect(suggestGenre(["Fiction / Mystery & Detective"])).toBe("GIALLI");
    expect(suggestGenre(["Fiction / Family Life"])).toBe("NARRATIVA");
    expect(suggestGenre(["History", "Fiction"])).toBe("STORIA");
  });

  it("maiuscole e spazi non contano", () => {
    expect(suggestGenre(["  juvenile fiction "])).toBe("RAGAZZI");
    expect(suggestGenre(["FICTION/ROMANCE"])).toBe("ROMANZO");
  });

  it("niente categorie o categoria sconosciuta → nessun suggerimento (mai «Altro»)", () => {
    expect(suggestGenre(undefined)).toBeNull();
    expect(suggestGenre([])).toBeNull();
    expect(suggestGenre(["Antiques & Collectibles"])).toBeNull();
    expect(suggestGenre([""])).toBeNull();
  });
});

describe("genere scritto a mano (CSV)", () => {
  it("accetta etichetta o chiave, senza badare a maiuscole e accenti", () => {
    expect(genreFromText("Gialli e thriller")).toBe("GIALLI");
    expect(genreFromText("gialli E THRILLER")).toBe("GIALLI");
    expect(genreFromText("Religione e spiritualita")).toBe("RELIGIONE");
    expect(genreFromText("tempo_libero")).toBe("TEMPO_LIBERO");
  });

  it("sconosciuto o vuoto → null", () => {
    expect(genreFromText("Romanzi rosa")).toBeNull();
    expect(genreFromText("")).toBeNull();
  });
});
