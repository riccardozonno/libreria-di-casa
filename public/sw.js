/* global self, caches, fetch, URL */
// Service worker di HOME LIBRARY (docs/architecture.md).
// Mette in cache SOLO asset statici immutabili (JS/CSS di Vite con hash in /assets, icone, WASM dello scanner).
// Mai pagine HTML, dati, copertine o API: i dati restano sempre online e dietro Cloudflare Access.
// Senza rete, le navigazioni mostrano la pagina offline (public/offline.html, servita come /offline:
// Workers Assets toglie ".html" con un rinvio, e una risposta rinviata non si può dare a una navigazione).

const CACHE = "home-library-static-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/offline.css", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.origin === self.location.origin && ["/assets/", "/icons/", "/vendor/"].some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
