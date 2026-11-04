import { useActionState } from "react";
import type { GenreKey } from "../../../shared/genres";
import { parseAuthors } from "../../../shared/schemas";
import { GenreOptions } from "../../components/genre-options";
import { Button, Notice, SelectField, TextArea, TextField } from "../../components/ui";
import { send } from "../../lib/api";
import { type ActionState, failure, initialActionState, text } from "../../lib/action-state";

// «Modifica dati»: dati del libro e genere in un solo modulo. Li modificano l'admin e gli editor delle sedi
// in cui il libro ha una copia (decisione del 04/11/2026, docs/permissions.md).

interface EditableBook {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  genre: GenreKey | null;
}

export function EditBookForm({ book, onDone }: { book: EditableBook; onDone: (saved: boolean) => void }) {
  const [state, action, isPending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    const year = text(form, "publishedYear").trim();
    try {
      await send(`/books/${book.id}`, "PATCH", {
        isbn13: text(form, "isbn13"),
        title: text(form, "title"),
        authors: parseAuthors(text(form, "authors")),
        publishedYear: year === "" ? null : year,
        description: text(form, "description"),
        genre: text(form, "genre") || null,
      });
      onDone(true);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
      <TextField label="Titolo" name="title" defaultValue={book.title} required maxLength={300} error={state.fields?.title} autoFocus />
      <TextArea label="Autori (uno per riga)" name="authors" defaultValue={book.authors.join("\n")} error={state.fields?.authors} />
      <TextField label="Anno" name="publishedYear" inputMode="numeric" defaultValue={book.publishedYear ?? ""} error={state.fields?.publishedYear} />
      <TextField label="ISBN" name="isbn13" inputMode="numeric" defaultValue={book.isbn13 ?? ""} error={state.fields?.isbn13} />
      <SelectField label="Genere" name="genre" defaultValue={book.genre ?? ""} error={state.fields?.genre}>
        <option value="">Nessun genere</option>
        <GenreOptions />
      </SelectField>
      <TextArea label="Descrizione" name="description" defaultValue={book.description ?? ""} maxLength={5000} error={state.fields?.description} />
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          Salva
        </Button>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
