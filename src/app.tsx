import { useEffect, useState } from "react";
import type { Role } from "../shared/policy";
import { ApiError, api } from "./lib/api";

// Fase 2: guscio dell'app. Verifica chi sei (Access + utente nel DB); le schermate arrivano in fase 3.

interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  editorLocationIds: string[];
}

type State = { status: "loading" } | { status: "ready"; me: Me } | { status: "error"; message: string; canReload: boolean };

const ROLE_LABELS: Record<Role, string> = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api<Me>("/me", { signal: controller.signal })
      .then((me) => setState({ status: "ready", me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Qualcosa è andato storto.";
        setState({ status: "error", message, canReload: error instanceof ApiError && error.status === 401 });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <h1 className="font-serif text-[28px] font-semibold tracking-tight">HOME LIBRARY</h1>
      <p className="mt-1 text-[15px] text-ink-soft">I libri di casa, in ogni sede.</p>

      <section aria-live="polite" className="mt-6 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-card)]">
        {state.status === "loading" && <p className="text-ink-soft">Verifica dell'accesso…</p>}
        {state.status === "ready" && (
          <>
            <p className="text-[17px]">
              Ciao <strong>{state.me.name}</strong>
            </p>
            <p className="mt-1 text-[15px] text-ink-soft">
              {ROLE_LABELS[state.me.role]} · {state.me.email}
            </p>
          </>
        )}
        {state.status === "error" && (
          <>
            <p role="alert" className="text-danger">
              {state.message}
            </p>
            {state.canReload && (
              <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-[var(--radius-sm)] bg-accent px-4 py-2.5 text-accent-ink">
                Ricarica
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
