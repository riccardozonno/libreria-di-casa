"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button, Notice } from "@/components/ui";
import { initialActionState } from "@/lib/action-state";
import { importCsvAction } from "./actions";

// Due passi: "Controlla" (prova senza scrittura) e poi "Importa", abilitato solo se non ci sono errori.
export function ImportForm() {
  const [state, action, isPending] = useActionState(importCsvAction, initialActionState);
  const [intent, setIntent] = useState<"preview" | "import">("preview");
  const report = state.ok ? state.data : null;
  // Un file scelto dopo l'anteprima va ricontrollato prima di poterlo importare.
  const [checkedFile, setCheckedFile] = useState(false);
  const canImport = checkedFile && report !== null && !report.applied && report.summary.errors === 0 && report.summary.newCopies > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Il pulsante premuto (name="intent") decide se è un'anteprima o l'import vero.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    setIntent(formData.get("intent") === "import" ? "import" : "preview");
    setCheckedFile(formData.get("intent") !== "import");
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
        File CSV
        <input type="file" name="file" accept=".csv,text/csv" required className="text-[15px] font-normal text-ink" onChange={() => setCheckedFile(false)} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Se l&apos;ISBN è già in catalogo</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="mode" value="add-copy" defaultChecked className="h-5 w-5 accent-[var(--accent)]" />
          Aggiungi come nuova copia
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="mode" value="skip" className="h-5 w-5 accent-[var(--accent)]" />
          Salta la riga
        </label>
      </fieldset>

      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}

      {report && (
        <div className="flex flex-col gap-2">
          <Notice tone={report.applied ? "success" : report.summary.errors > 0 ? "error" : "info"}>
            {report.applied ? "Import completato: " : "Anteprima (nessuna modifica salvata): "}
            {report.summary.rows} righe · {report.summary.newBooks} libri nuovi · {report.summary.newCopies} copie
            {report.summary.skipped > 0 && ` · ${report.summary.skipped} saltate`}
            {report.summary.errors > 0 && ` · ${report.summary.errors} errori: correggi il file e riprova`}
          </Notice>
          {report.errors.length > 0 && (
            <ul tabIndex={0} aria-label="Errori nel file" className="max-h-64 overflow-y-auto rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-[14px] text-danger">
              {report.errors.map((error) => (
                <li key={`${error.line}-${error.message}`}>
                  Riga {error.line}: {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant="secondary" disabled={isPending}>
          {isPending && intent === "preview" ? "Controllo…" : "Controlla il file"}
        </Button>
        <Button type="submit" name="intent" value="import" disabled={isPending || !canImport}>
          {isPending && intent === "import" ? "Importazione…" : "Importa"}
        </Button>
      </div>
    </form>
  );
}
