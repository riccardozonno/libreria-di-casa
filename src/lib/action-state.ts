// Esito delle Server Actions, condiviso tra server e componenti client (nessuna dipendenza server).

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; details?: Readonly<Record<string, string>> };

export const initialActionState: ActionResult<never> = { ok: false, error: "" };
