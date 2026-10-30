import { ApiError, errorMessage } from "./api";

// Esito di un modulo (React 19 useActionState): messaggio generale ed errori per campo.

export interface ActionState {
  ok: boolean;
  message?: string;
  error?: string;
  fields?: Record<string, string>;
}

export const initialActionState: ActionState = { ok: false };

export function failure(error: unknown): ActionState {
  return { ok: false, error: errorMessage(error), fields: error instanceof ApiError ? error.body.fields : undefined };
}

export const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
