import { GENRES } from "../../shared/genres";

/** Voci del menu «Genere», nell'ordine dell'elenco approvato (shared/genres.ts). */
export function GenreOptions() {
  return (
    <>
      {GENRES.map((genre) => (
        <option key={genre.key} value={genre.key}>
          {genre.label}
        </option>
      ))}
    </>
  );
}
