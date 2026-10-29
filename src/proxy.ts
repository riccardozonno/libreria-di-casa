import { NextResponse, type NextRequest } from "next/server";

// Proxy (ex middleware) — ADR-0009 e docs/architecture.md:
// 1. In produzione accetta solo traffico arrivato da cloudflared (header CF-Connecting-IP).
// 2. Richieste che modificano dati: l'Origin deve essere la nostra (difesa CSRF in più a SameSite e ai controlli di Next/Better Auth).
// 3. CSP con nonce per richiesta + header di sicurezza su tutte le risposte.

const isDev = process.env.NODE_ENV === "development";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const publicOrigin = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : null;

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': solo per lo scanner zxing (WebAssembly), non abilita eval di JavaScript.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function originAllowed(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === request.nextUrl.origin || origin === publicOrigin;
}

export function proxy(request: NextRequest): NextResponse {
  if (process.env.TRUST_CLOUDFLARE_ONLY === "true" && !request.headers.get("cf-connecting-ip") && request.nextUrl.pathname !== "/api/health") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!originAllowed(request)) {
    return new NextResponse("Origine non consentita", { status: 403 });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  if (!isDev) response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return response;
}

export const config = {
  // Esclusi gli asset statici con hash (immutabili) e le icone: non contengono HTML né script inline.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|vendor/|icons/|favicon.ico|manifest.webmanifest).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
