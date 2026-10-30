// Normalizzazione ISBN (ADR-0006): tutto diventa ISBN-13 con checksum verificato.

const BOOKLAND_PREFIXES = ["978", "979"] as const;

function isbn13CheckDigit(first12: string): string {
  const sum = [...first12].reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn10(isbn10: string): boolean {
  const sum = [...isbn10].reduce((acc, char, index) => {
    const value = char === "X" ? 10 : Number(char);
    return acc + value * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

/** Restituisce l'ISBN-13 normalizzato oppure null se l'input non è un ISBN valido. */
export function normalizeIsbn(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "").toUpperCase();

  if (/^\d{13}$/.test(compact)) {
    const isBook = BOOKLAND_PREFIXES.some((prefix) => compact.startsWith(prefix));
    const checksumOk = isbn13CheckDigit(compact.slice(0, 12)) === compact[12];
    return isBook && checksumOk ? compact : null;
  }

  if (/^\d{9}[\dX]$/.test(compact) && isValidIsbn10(compact)) {
    const first12 = `978${compact.slice(0, 9)}`;
    return first12 + isbn13CheckDigit(first12);
  }

  return null;
}

/** Forma leggibile minima: separa solo il prefisso (i gruppi interni dipendono dall'editore). */
export function formatIsbn13(isbn13: string): string {
  return `${isbn13.slice(0, 3)}-${isbn13.slice(3)}`;
}
