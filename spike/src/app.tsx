import { useEffect, useState } from "react";
import { resizeCover } from "./resize";
import { Scanner } from "./scanner";

// Pagina unica della prova di fattibilità: ogni sezione verifica un punto del piano (fase 1).

interface BookRow {
  id: number;
  title: string;
  authors: string;
  isbn13: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Errore ${response.status}`);
  return body;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Errore");

function Identity() {
  const [text, setText] = useState("Verifica in corso…");
  useEffect(() => {
    api<{ email: string; source: string }>("/me")
      .then((me) => setText(`Accesso come ${me.email} (${me.source === "access" ? "Cloudflare Access" : "identità di sviluppo"})`))
      .catch((error) => setText(`Non autorizzato: ${errorText(error)}`));
  }, []);
  return (
    <section>
      <h2>1. Accesso</h2>
      <p>{text}</p>
      <p className="muted">Modalità: {window.matchMedia("(display-mode: standalone)").matches ? "app installata" : "browser"}</p>
    </section>
  );
}

function Search() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BookRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (query.trim() === "") return;
    const timer = setTimeout(() => {
      const started = performance.now();
      api<{ rows: BookRow[] }>(`/search?q=${encodeURIComponent(query)}`)
        .then((result) => {
          setRows(result.rows);
          setMessage(`${result.rows.length} risultati in ${Math.round(performance.now() - started)} ms (andata e ritorno)`);
        })
        .catch((error) => setMessage(errorText(error)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section>
      <h2>2. Ricerca (FTS5)</h2>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Prova: perche citta, liberta, calvino" aria-label="Cerca" />
      <p className="muted">{query.trim() === "" ? "" : message}</p>
      <ul>
        {query.trim() !== "" && rows.slice(0, 10).map((row) => <li key={row.id}>{row.title} — {row.authors}</li>)}
      </ul>
    </section>
  );
}

function AddBook() {
  const [scanning, setScanning] = useState(false);
  const [isbn, setIsbn] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    try {
      const result = await api<{ id: number }>("/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Libro di prova ${new Date().toLocaleTimeString("it-IT")}`, authors: "Autore di prova", isbn13: isbn }),
      });
      const check = await api<{ appendOnly: boolean }>("/checks/audit-append-only", { method: "POST" });
      setMessage(`Salvato (id ${result.id}) con riga di registro. Registro in sola aggiunta: ${check.appendOnly ? "sì" : "NO"}`);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return (
    <section>
      <h2>3. Scanner e scrittura</h2>
      {scanning ? (
        <Scanner onDetected={(found) => { setIsbn(found); setScanning(false); }} />
      ) : (
        <button onClick={() => setScanning(true)}>Scansiona un codice a barre</button>
      )}
      {isbn !== "" && <p className="ok">ISBN letto: {isbn}</p>}
      <button onClick={() => void save()}>Salva un libro di prova</button>
      <p className="muted">{message}</p>
    </section>
  );
}

function Cover() {
  const [message, setMessage] = useState("");
  const [src, setSrc] = useState("");

  async function upload(file: File) {
    try {
      const blob = await resizeCover(file);
      const key = `prova-${Date.now()}`;
      const result = await api<{ bytes: number }>(`/covers/${key}`, { method: "PUT", body: blob });
      setMessage(`Caricata su R2: ${Math.round(result.bytes / 1024)} KB (da ${Math.round(file.size / 1024)} KB)`);
      setSrc(`/api/covers/${key}`);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return (
    <section>
      <h2>4. Copertina su R2</h2>
      <input type="file" accept="image/*" aria-label="Foto della copertina" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <p className="muted">{message}</p>
      {src !== "" && <img className="cover" src={src} alt="Copertina caricata" />}
    </section>
  );
}

export function App() {
  return (
    <main>
      <h1>HOME LIBRARY · prova di fattibilità</h1>
      <p className="muted">Fase 1: verifica di Access, ricerca, scrittura, scanner e copertine su Cloudflare.</p>
      <Identity />
      <Search />
      <AddBook />
      <Cover />
    </main>
  );
}
