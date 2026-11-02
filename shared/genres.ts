import { normalizeForSearch } from "./text";

// Generi dei libri: elenco fisso in italiano (approvato il 02/11/2026), uno per libro.
// Google Books suggerisce il genere con la sua prima categoria (in inglese, stile BISAC):
// è solo un suggerimento, chi aggiunge il libro lo conferma o lo cambia.

export const GENRES = [
  { key: "NARRATIVA", label: "Narrativa" },
  { key: "GIALLI", label: "Gialli e thriller" },
  { key: "FANTASY", label: "Fantasy e fantascienza" },
  { key: "ROMANZO", label: "Romanzo" },
  { key: "CLASSICI", label: "Classici" },
  { key: "POESIA", label: "Poesia e teatro" },
  { key: "RAGAZZI", label: "Ragazzi" },
  { key: "FUMETTI", label: "Fumetti e graphic novel" },
  { key: "BIOGRAFIA", label: "Biografia" },
  { key: "STORIA", label: "Storia" },
  { key: "FILOSOFIA", label: "Filosofia" },
  { key: "PSICOLOGIA", label: "Psicologia ed educazione" },
  { key: "RELIGIONE", label: "Religione e spiritualità" },
  { key: "SOCIETA", label: "Politica e società" },
  { key: "ECONOMIA", label: "Economia e lavoro" },
  { key: "LINGUE", label: "Lingue e critica letteraria" },
  { key: "SCIENZA", label: "Scienza e natura" },
  { key: "ARTE", label: "Arte, musica e spettacolo" },
  { key: "VIAGGI", label: "Viaggi" },
  { key: "CUCINA", label: "Cucina" },
  { key: "TEMPO_LIBERO", label: "Casa, salute e tempo libero" },
  { key: "ALTRO", label: "Altro" },
] as const;

export type GenreKey = (typeof GENRES)[number]["key"];
export const GENRE_KEYS = GENRES.map((genre) => genre.key) as [GenreKey, ...GenreKey[]];

const LABELS = new Map<GenreKey, string>(GENRES.map((genre) => [genre.key, genre.label]));

export function genreLabel(key: GenreKey): string {
  return LABELS.get(key) ?? key;
}

/** Sottocategorie di «Fiction» con un genere proprio: si controllano prima della categoria. */
const SUBCATEGORY_RULES: ReadonlyArray<readonly [string, GenreKey]> = [
  ["fiction / mystery", "GIALLI"],
  ["fiction / thrillers", "GIALLI"],
  ["fiction / crime", "GIALLI"],
  ["fiction / fantasy", "FANTASY"],
  ["fiction / science fiction", "FANTASY"],
  ["fiction / romance", "ROMANZO"],
  ["fiction / classics", "CLASSICI"],
];

const CATEGORY_RULES = new Map<string, GenreKey>([
  ["fiction", "NARRATIVA"],
  ["literary collections", "NARRATIVA"],
  ["true crime", "GIALLI"],
  ["poetry", "POESIA"],
  ["drama", "POESIA"],
  ["juvenile fiction", "RAGAZZI"],
  ["juvenile nonfiction", "RAGAZZI"],
  ["young adult fiction", "RAGAZZI"],
  ["young adult nonfiction", "RAGAZZI"],
  ["comics & graphic novels", "FUMETTI"],
  ["biography & autobiography", "BIOGRAFIA"],
  ["history", "STORIA"],
  ["philosophy", "FILOSOFIA"],
  ["psychology", "PSICOLOGIA"],
  ["education", "PSICOLOGIA"],
  ["family & relationships", "PSICOLOGIA"],
  ["religion", "RELIGIONE"],
  ["body, mind & spirit", "RELIGIONE"],
  ["political science", "SOCIETA"],
  ["social science", "SOCIETA"],
  ["law", "SOCIETA"],
  ["business & economics", "ECONOMIA"],
  ["language arts & disciplines", "LINGUE"],
  ["literary criticism", "LINGUE"],
  ["foreign language study", "LINGUE"],
  ["science", "SCIENZA"],
  ["nature", "SCIENZA"],
  ["mathematics", "SCIENZA"],
  ["medical", "SCIENZA"],
  ["technology & engineering", "SCIENZA"],
  ["computers", "SCIENZA"],
  ["art", "ARTE"],
  ["music", "ARTE"],
  ["performing arts", "ARTE"],
  ["photography", "ARTE"],
  ["architecture", "ARTE"],
  ["design", "ARTE"],
  ["travel", "VIAGGI"],
  ["cooking", "CUCINA"],
  ["health & fitness", "TEMPO_LIBERO"],
  ["self-help", "TEMPO_LIBERO"],
  ["gardening", "TEMPO_LIBERO"],
  ["crafts & hobbies", "TEMPO_LIBERO"],
  ["house & home", "TEMPO_LIBERO"],
  ["sports & recreation", "TEMPO_LIBERO"],
  ["games & activities", "TEMPO_LIBERO"],
  ["pets", "TEMPO_LIBERO"],
]);

/** Genere suggerito dalla prima categoria di Google Books; null se non corrisponde a niente (mai «Altro»). */
export function suggestGenre(categories: readonly string[] | undefined): GenreKey | null {
  const category = categories?.[0]?.toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
  if (!category) return null;
  const subcategory = SUBCATEGORY_RULES.find(([prefix]) => category.startsWith(prefix));
  if (subcategory) return subcategory[1];
  return CATEGORY_RULES.get(category.split(" / ")[0] ?? category) ?? null;
}

const BY_TEXT = new Map<string, GenreKey>(
  GENRES.flatMap((genre) => [[normalizeForSearch(genre.label), genre.key] as const, [genre.key.toLowerCase(), genre.key] as const]),
);

/** Genere scritto a mano (es. colonna del CSV): etichetta o chiave, senza badare a maiuscole e accenti. */
export function genreFromText(text: string): GenreKey | null {
  return BY_TEXT.get(normalizeForSearch(text)) ?? null;
}
