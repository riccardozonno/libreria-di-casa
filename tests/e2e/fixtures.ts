// Dati di partenza degli E2E: un utente per ruolo e una sede per l'editor.

export const E2E_STATE = ".wrangler/e2e";

export const USERS = {
  admin: { email: "admin@example.test", name: "Admin di prova", role: "ADMIN" },
  editor: { email: "editor@e2e.test", name: "Editor di prova", role: "EDITOR" },
  reader: { email: "lettore@e2e.test", name: "Lettore di prova", role: "READER" },
} as const;

export const EDITOR_LOCATION = { id: "e2e-casa", name: "Casa E2E", color: "VERDE" } as const;

export const asUser = (user: keyof typeof USERS) => ({ extraHTTPHeaders: { "X-Dev-Identity": USERS[user].email } });
