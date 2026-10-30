import { type ChangeEvent, useActionState, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { parseAuthors } from "../../../shared/schemas";
import { LocationSelect } from "../../components/location-select";
import { Button, Notice, TextArea, TextField } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { type ActionState, failure, initialActionState, text } from "../../lib/action-state";
import { resizeImageFile } from "../../lib/resize-image";

// Dati del nuovo libro (precompilati dalla ricerca ISBN o vuoti) + prima copia + foto facoltativa.

export interface BookFormInitial {
  isbn13: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverUrl: string | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "MANUAL";
}

interface BookFormProps {
  initial: BookFormInitial;
  locations: { id: string; name: string }[];
  onCancel: () => void;
  /** L'ISBN risulta già presente (inserimento contemporaneo): torna al flusso "aggiungi copia". */
  onExisting: (isbn13: string) => void;
}

export function BookForm({ initial, locations, onCancel, onExisting }: BookFormProps) {
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [photoError, setPhotoError] = useState("");

  const [state, action, isPending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    const year = text(form, "publishedYear").trim();
    const data = {
      book: { isbn13: initial.isbn13, title: text(form, "title"), authors: parseAuthors(text(form, "authors")), publishedYear: year === "" ? null : year, description: text(form, "description") },
      source: initial.source,
      locationId: text(form, "locationId"),
      copy: { shelf: text(form, "shelf"), notes: text(form, "notes") },
      ...(photo ? {} : initial.coverUrl ? { coverUrl: initial.coverUrl } : {}),
    };
    try {
      let created: { bookId: string };
      if (photo) {
        const body = new FormData();
        body.set("data", JSON.stringify(data));
        body.set("cover", photo.file);
        created = await api<{ bookId: string }>("/books", { method: "POST", body });
      } else {
        created = await api<{ bookId: string }>("/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      }
      navigate(`/libri/${created.bookId}`);
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && initial.isbn13) onExisting(initial.isbn13);
      return failure(error);
    }
  }, initialActionState);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    },
    [photo],
  );

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageFile(file);
      setPhotoError("");
      setPhoto({ file: resized, previewUrl: URL.createObjectURL(resized) });
    } catch {
      setPhotoError("Non riesco a leggere questa foto. Prova a scattarla di nuovo o scegline un'altra.");
    }
  }

  const fields = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center gap-4">
        {photo ? (
          <img src={photo.previewUrl} alt="Anteprima della copertina" width={80} height={120} className="h-[120px] w-20 rounded-[8px] object-cover shadow-[var(--shadow-card)]" />
        ) : (
          <div className="flex h-[120px] w-20 items-center justify-center rounded-[8px] bg-sunken px-1 text-center text-[12px] text-ink-faint">
            {initial.coverUrl ? "Copertina trovata" : "Senza copertina"}
          </div>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]">
          {photo ? "Cambia foto" : "Fotografa la copertina"}
          <input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} className="sr-only" />
        </label>
      </div>

      {photoError && <Notice tone="error">{photoError}</Notice>}
      {initial.isbn13 && <p className="text-[14px] text-ink-faint">ISBN {initial.isbn13}</p>}
      <TextField label="Titolo" name="title" defaultValue={initial.title} required maxLength={300} error={fields["book.title"]} />
      <TextArea label="Autori (uno per riga)" name="authors" defaultValue={initial.authors.join("\n")} rows={2} error={fields["book.authors"]} />
      <TextField label="Anno" name="publishedYear" inputMode="numeric" defaultValue={initial.publishedYear ?? ""} maxLength={4} error={fields["book.publishedYear"]} />
      <TextArea label="Descrizione" name="description" defaultValue={initial.description ?? ""} rows={4} maxLength={5000} error={fields["book.description"]} />

      <div className="mt-2 border-t border-line pt-4">
        <LocationSelect locations={locations} legend="In quale sede si trova?" />
        {fields.locationId && (
          <p role="alert" className="mt-1 text-[13px] text-danger">
            Scegli una sede.
          </p>
        )}
      </div>
      <TextField label="Collocazione (facoltativa)" name="shelf" maxLength={120} placeholder="Es. Studio, scaffale 2" />
      <TextField label="Note (facoltative)" name="notes" maxLength={1000} />

      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? "Salvataggio…" : "Salva il libro"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
