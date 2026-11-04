import { describe, expect, it } from "vitest";
import { inlineAppleTouchIconHtml } from "../../tools/inline-apple-touch-icon";

// iOS scarica l'icona della schermata Home senza i cookie di Access: va incorporata nella pagina.

describe("icona della schermata Home incorporata", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it("sostituisce il link con l'immagine in base64", () => {
    const html = '<head><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" /></head>';
    expect(inlineAppleTouchIconHtml(html, png)).toBe('<head><link rel="apple-touch-icon" href="data:image/png;base64,iVBORw==" /></head>');
  });

  it("se il link non c'è (index.html cambiato), ferma la build invece di non fare nulla", () => {
    expect(() => inlineAppleTouchIconHtml('<link rel="apple-touch-icon"  href="/icons/apple-touch-icon.png">', png)).toThrow(/apple-touch-icon/);
  });
});
