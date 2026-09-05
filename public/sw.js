// Service worker Cozimo — cache hors ligne basique, avec 3 stratégies distinctes :
// 1. Appels Supabase (supabase.co) : jamais mis en cache, toujours le réseau direct —
//    sinon la synchro cloud peut afficher des données obsolètes servies par le cache.
// 2. Document HTML principal ("/") : "network first" — on prend toujours la version la
//    plus récente de l'app quand le réseau est disponible, fallback cache hors ligne.
//    Sans ça, un rechargement normal pouvait resservir une vieille version de l'app
//    (d'où la nécessité d'un Ctrl+Shift+R pour voir les projets Supabase à jour).
// 3. Assets statiques (JS, CSS, images, fonts) : "cache first", comme avant — leur
//    contenu est immuable (URLs versionnées par Metro), donc le cache est fiable et rapide.
// v3 : bump du nom de cache pour forcer les visiteurs existants à purger toute réponse
// déjà en cache pour "/favicon.png" (ex : un 404 mis en cache avant que le fichier existe),
// et précache du favicon comme les autres icônes pour garantir qu'il soit toujours servi.
const CACHE_NAME = "cozimo-v3";
const PRECACHE_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/favicon.png"];
const STATIC_ASSET_DESTINATIONS = ["script", "style", "image", "font"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
  );
  self.clients.claim();
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || caches.match("/")));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // 1. Supabase — jamais de cache, passthrough réseau direct.
  if (request.url.includes("supabase.co")) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Document HTML principal — "network first".
  const isNavigation = request.mode === "navigate" || new URL(request.url).pathname === "/";
  if (isNavigation) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 3. Assets statiques (JS, CSS, images, fonts) — "cache first".
  if (STATIC_ASSET_DESTINATIONS.includes(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Autres requêtes GET (manifest.json, etc.) — comportement "cache first" historique.
  event.respondWith(cacheFirst(request).catch(() => caches.match("/")));
});
