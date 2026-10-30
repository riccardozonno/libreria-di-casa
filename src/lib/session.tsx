import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type Action, type Actor, can, type Role } from "../../shared/policy";
import { ApiError, api, errorMessage } from "./api";

// Chi è entrato: utente, ruolo e sedi da /api/me (riletti dal DB). I permessi nell'interfaccia sono
// solo una comodità per nascondere i pulsanti: l'API li ricontrolla sempre.

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  editorLocationIds: string[];
}

interface Session {
  me: Me;
  can: (action: Action) => boolean;
}

const SessionContext = createContext<Session | null>(null);

/** Esce da Cloudflare Access (cancella il suo cookie): al ricaricamento chiede di nuovo email e codice. */
export function leaveAccess(): void {
  window.location.assign("/cdn-cgi/access/logout");
}

type LoadState = { status: "loading" } | { status: "ready"; me: Me } | { status: "error"; message: string; needsLogin: boolean };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api<Me>("/me", { signal: controller.signal })
      .then((me) => setState({ status: "ready", me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: errorMessage(error), needsLogin: error instanceof ApiError && error.status === 401 });
      });
    return () => controller.abort();
  }, []);

  const session = useMemo<Session | null>(() => {
    if (state.status !== "ready") return null;
    const actor: Actor = { id: state.me.id, role: state.me.role, active: true, editorLocationIds: new Set(state.me.editorLocationIds) };
    return { me: state.me, can: (action) => can(actor, action) };
  }, [state]);

  if (state.status === "loading") {
    return <p className="p-6 text-center text-ink-soft">Apertura di HOME LIBRARY…</p>;
  }
  if (state.status === "error" || !session) {
    const needsLogin = state.status === "error" && state.needsLogin;
    return (
      <main className="mx-auto max-w-md px-4 pt-[max(3rem,env(safe-area-inset-top))]">
        <h1 className="font-serif text-[28px] font-semibold">HOME LIBRARY</h1>
        <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2.5 text-danger">
          {state.status === "error" ? state.message : "Qualcosa è andato storto."}
        </p>
        <button
          type="button"
          onClick={needsLogin ? leaveAccess : () => window.location.reload()}
          className="mt-4 min-h-11 rounded-[var(--radius-md)] bg-accent px-4 font-semibold text-accent-ink"
        >
          {needsLogin ? "Accedi di nuovo" : "Riprova"}
        </button>
      </main>
    );
  }
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession fuori da SessionProvider");
  return session;
}
