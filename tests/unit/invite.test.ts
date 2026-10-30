import { describe, expect, it } from "vitest";
import { inviteText } from "../../src/lib/invite";

// Testo che l'admin manda a chi ha appena aggiunto: l'app non spedisce email, il codice lo manda
// Cloudflare Access quando la persona prova a entrare.

describe("inviteText", () => {
  it("dice dove andare, quale email usare e da chi arriva il codice", () => {
    const text = inviteText({ name: "Giulia", email: "giulia@example.com", appUrl: "https://homelibrary.example.workers.dev" });
    expect(text).toContain("Ciao Giulia");
    expect(text).toContain("https://homelibrary.example.workers.dev");
    expect(text).toContain("giulia@example.com");
    expect(text).toContain("Cloudflare Access");
    expect(text).toMatch(/spam/i);
  });
});
