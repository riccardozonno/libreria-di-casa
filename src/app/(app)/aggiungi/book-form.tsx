"use client";

import { startTransition, useActionState, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { LocationSelect } from "@/components/location-select";
import { Button, Notice, TextArea, TextField } from "@/components/ui";
import { initialActionState } from "@/lib/action-state";
import { resizeImageFile } from "@/lib/resize-image";
import { createBookAction } from "./actions";

export interface BookFormInitial {
  isbn13: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverUrl: string | null;
  coverPreview: string | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "MANUAL";
}

interface BookFormProps {
  initial: BookFormInitial;
  locations: { id: string; name: string }[];
  onCancel: () => void;
  /** L'ISBN risulta già presente (inserimento simultaneo): torna al flusso "aggiungi copia". */
  onExisting: (isbn13: string) => void;
}

export function BookForm({ initial, locations, onCancel, onExisting }: BookFormProps) {
  const [state, formAction, isPending] = useActionState(createBookAction, initialActionState);
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const fieldErrors = state.ok ? {} : (state.fieldErrors ?? {});

  useEffect(() => {
    if (!state.ok && state.details?.bookId && initial.isbn13) onExisting(initial.isbn13);
  }, [state, initial.isbn13, onExisting]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.delete("coverPicker");
    if (photo) formData.set("coverFile", photo.file);
    startTransition(() => formAction(formData));
  }

  const preview = photo?.previewUrl ?? initial.coverPreview;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="isbn13" value={initial.isbn13} />
      <input type="hidden" name="source" value={initial.source} />
      <input type="hidden" name="coverUrl" value={photo ? "" : (initial.coverUrl ?? "")} />

      <div className="flex items-center gap-4">
        {preview ? (
          // Anteprima data:/blob: generata localmente: next/image non gestisce questi URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Anteprima della copertina" width={80} height={120} className="h-[120px] w-20 rounded-[8px] object-cover shadow-[var(--shadow-card)]" />
        ) : (
          <div className="flex h-[120px] w-20 items-center justify-center rounded-[8px] bg-sunken text-[12px] text-ink-faint">Senza copertina</div>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]">
          {preview ? "Cambia foto" : "Fotografa la copertina"}
          <input type="file" name="coverPicker" accept="image/*" capture="environment" onChange={handlePhoto} className="sr-only" />
        </label>
      </div>

      {photoError && <Notice tone="error">{photoError}</Notice>}
      {initial.isbn13 && <p className="text-[14px] text-ink-faint">ISBN {initial.isbn13}</p>}
      <TextField label="Titolo" name="title" defaultValue={initial.title} required maxLength={300} error={fieldErrors.title} />
      <TextArea label="Autori (uno per riga)" name="authors" defaultValue={initial.authors.join("\n")} rows={2} error={fieldErrors.authors} />
      <TextField label="Anno" name="publishedYear" inputMode="numeric" defaultValue={initial.publishedYear ?? ""} maxLength={4} error={fieldErrors.publishedYear} />
      <TextArea label="Descrizione" name="description" defaultValue={initial.description ?? ""} rows={4} maxLength={5000} error={fieldErrors.description} />

      <div className="mt-2 border-t border-line pt-4">
        <LocationSelect locations={locations} legend="In quale sede si trova?" />
        {fieldErrors.locationId && (
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
