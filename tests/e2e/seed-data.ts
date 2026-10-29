// Dati fissi degli scenari E2E (solo database di test).

export const E2E_PASSWORD = "password-di-prova-e2e";

export const E2E_USERS = {
  admin: { id: "00000000-0000-4000-8000-000000000001", name: "Anna Admin", email: "admin@e2e.test", role: "ADMIN" },
  editor: { id: "00000000-0000-4000-8000-000000000002", name: "Elio Editor", email: "editor@e2e.test", role: "EDITOR" },
  reader: { id: "00000000-0000-4000-8000-000000000003", name: "Lia Lettrice", email: "reader@e2e.test", role: "READER" },
} as const;

export const SEED = {
  casa: { id: "00000000-0000-4000-8000-0000000000c1", name: "Casa", color: "VERDE" },
  mare: { id: "00000000-0000-4000-8000-0000000000c2", name: "Mare", color: "AZZURRO" },
  book: {
    id: "00000000-0000-4000-8000-0000000000b1",
    isbn13: "9788804668237",
    title: "Il barone rampante",
    authors: ["Italo Calvino"],
  },
} as const;
