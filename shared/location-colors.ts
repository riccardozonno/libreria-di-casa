// Palette delle sedi (enum LocationColor nello schema Prisma). Ogni sede ha un colore diverso.
// Classi Tailwind scritte per intero: niente style inline (la CSP non ammette 'unsafe-inline').

export type LocationColorKey =
  | "ROSSO"
  | "ARANCIO"
  | "GIALLO"
  | "VERDE"
  | "TURCHESE"
  | "AZZURRO"
  | "BLU"
  | "VIOLA"
  | "ROSA"
  | "MARRONE";

interface LocationColorInfo {
  key: LocationColorKey;
  label: string;
  className: string;
}

export const LOCATION_COLORS: readonly LocationColorInfo[] = [
  { key: "ROSSO", label: "Rosso", className: "bg-[#e2574c]" },
  { key: "ARANCIO", label: "Arancio", className: "bg-[#f08c2e]" },
  { key: "GIALLO", label: "Giallo", className: "bg-[#e3b52f]" },
  { key: "VERDE", label: "Verde", className: "bg-[#3f9f5f]" },
  { key: "TURCHESE", label: "Turchese", className: "bg-[#2fb2a2]" },
  { key: "AZZURRO", label: "Azzurro", className: "bg-[#4a9fe8]" },
  { key: "BLU", label: "Blu", className: "bg-[#3b56c4]" },
  { key: "VIOLA", label: "Viola", className: "bg-[#8e6fd8]" },
  { key: "ROSA", label: "Rosa", className: "bg-[#e06c9f]" },
  { key: "MARRONE", label: "Marrone", className: "bg-[#a9773f]" },
];

export const LOCATION_COLOR_KEYS = LOCATION_COLORS.map((color) => color.key) as [LocationColorKey, ...LocationColorKey[]];

export function locationColorClass(key: LocationColorKey): string {
  return LOCATION_COLORS.find((color) => color.key === key)?.className ?? "bg-ink-faint";
}

export function locationColorLabel(key: LocationColorKey): string {
  return LOCATION_COLORS.find((color) => color.key === key)?.label ?? key;
}

/** Primo colore della palette non ancora usato, o null se sono tutti occupati. */
export function nextFreeColor(used: readonly LocationColorKey[]): LocationColorKey | null {
  return LOCATION_COLORS.find((color) => !used.includes(color.key))?.key ?? null;
}
