import { useState } from "react";
import { Link } from "react-router";
import type { DuplicateMode, ImportPlan } from "../../shared/csv/plan";
import { Button, Notice, PageHeader, Section } from "../components/ui";
import { errorMessage } from "../lib/api";
import { applyImport, downloadCatalog, type ImportTotals, previewImport } from "../lib/csv-client";
import { type LocationSummary, useLocations } from "../lib/locations";

// Import ed export CSV (solo admin). Colonne: isbn;titolo;autori;anno;genere;descrizione;sede;collocazione;note.

function ExportSection() {
  const { locations } = useLocations();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function download(location: LocationSummary | null) {
    setBusy(location?.id ?? "tutto");
    setMessage(null);
    try {
      const count = await downloadCatalog(location);
      setMessage({ tone: "success", text: `File pronto: ${count} ${count === 1 ? "copia" : "copie"}.` });
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Esporta">
      <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
        <Button onClick={() => void download(null)} disabled={busy !== null}>
          {busy === "tutto" ? "Preparazione…" : "Scarica catalogo completo"}
        </Button>
        {locations.map((location) => (
          <Button key={location.id} variant="secondary" onClick={() => void download(location)} disabled={busy !== null}>
            {busy === location.id ? "Preparazione…" : `Scarica catalogo ${location.name}`}
          </Button>
        ))}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    </Section>
  );
}

function ImportSection() {
  const { locations } = useLocations();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DuplicateMode>("add-copy");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "importing">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportTotals | null>(null);
  const [error, setError] = useState("");

  const reset = (next: Partial<{ file: File | null; mode: DuplicateMode }>) => {
    if ("file" in next) setFile(next.file ?? null);
    if (next.mode) setMode(next.mode);
    setPlan(null);
    setResult(null);
    setError("");
  };

  async function check() {
    if (!file) return setError("Scegli un file CSV.");
    setPhase("checking");
    setError("");
    try {
      setPlan(await previewImport(file, locations, mode));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  async function run() {
    if (!plan) return;
    setPhase("importing");
    setProgress(0);
    try {
      setResult(await applyImport(plan, setProgress));
    } catch (caught) {
      setError(`Import interrotto: ${errorMessage(caught)}. Le righe già importate restano; ricontrolla il file per vedere cosa manca.`);
    } finally {
      setPhase("idle");
    }
  }

  const canImport = plan !== null && plan.summary.errors === 0 && plan.operations.length > 0 && result === null;

  return (
    <Section title="Importa">
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
        <p className="text-[14px] text-ink-soft">
          Colonne: <code className="break-all">isbn;titolo;autori;anno;genere;descrizione;sede;collocazione;note</code>. Obbligatorie: titolo e sede. Più autori separati da <code>|</code>. Il genere è facoltativo e si scrive come nell'app (es. <code>Gialli e thriller</code>).
        </p>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
          File CSV
          <input type="file" accept=".csv,text/csv" onChange={(event) => reset({ file: event.target.files?.[0] ?? null })} className="text-[15px] font-normal text-ink" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Se l&apos;ISBN è già in catalogo</legend>
          {(
            [
              ["add-copy", "Aggiungi come nuova copia"],
              ["skip", "Salta la riga"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => reset({ mode: value })} className="h-5 w-5 accent-[var(--accent)]" />
              {label}
            </label>
          ))}
        </fieldset>

        {plan && (
          <div className="flex flex-col gap-2">
            <Notice tone={plan.summary.errors > 0 ? "error" : "info"}>
              Anteprima (nessuna modifica salvata): {plan.summary.rows} righe · {plan.summary.newBooks} libri nuovi · {plan.summary.newCopies} copie
              {plan.summary.skipped > 0 && ` · ${plan.summary.skipped} saltate`}
              {plan.summary.errors > 0 && ` · ${plan.summary.errors} errori: correggi il file e ricontrollalo`}
            </Notice>
            {plan.errors.length > 0 && (
              <ul tabIndex={0} aria-label="Errori nel file" className="max-h-64 overflow-y-auto rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-[14px] text-danger">
                {plan.errors.map((rowError) => (
                  <li key={`${rowError.line}-${rowError.message}`}>
                    Riga {rowError.line}: {rowError.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {phase === "importing" && plan && (
          <p role="status" className="text-[14px] text-ink-soft">
            Importazione… {progress} di {plan.operations.length} righe
          </p>
        )}
        {result && (
          <Notice tone="success">
            Import completato: {result.newBooks} libri nuovi · {result.newCopies} copie
            {result.missing.length > 0 && ` · righe non importate (libro non più presente): ${result.missing.join(", ")}`}
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void check()} disabled={phase !== "idle" || !file}>
            {phase === "checking" ? "Controllo…" : "Controlla il file"}
          </Button>
          <Button onClick={() => void run()} disabled={phase !== "idle" || !canImport}>
            {phase === "importing" ? "Importazione…" : "Importa"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function CsvPage() {
  return (
    <>
      <Link to="/admin" className="-ml-2 mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Admin
      </Link>
      <PageHeader title="Import ed export CSV" subtitle="Una riga per copia, separatore punto e virgola" />
      <ExportSection />
      <ImportSection />
    </>
  );
}
