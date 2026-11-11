/* Camino hacia Jesús — Service Worker compartido */
const CACHE_VERSION = 'camino-hacia-jesus-shell-v3';

/* Solo se precargan rutas verificadas en el repositorio.
   No incluir catequizandos.html ni iconos inexistentes: addAll() fallaría
   y bloquearía la instalación completa del Service Worker. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './programacion.html',
  './CATEQUISTA.html',
  './padres.html',
  './GestorPastoral.html',
  './assets/PORTAL CATEQUESIS.png',
  './assets/BTN-PROGRAMACION.png',
  './assets/BTN-CATEQUIS.png',
  './assets/BTN_CATEQUISTAS.png',
  './assets/BTN-PADRES.png',
  './assets/BTN_COORDINADOR.png',
  './assets/insignia.png',
  './assets/logo-la-salle.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('camino-hacia-jesus-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const update = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await update || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Apps Script, consultas con parámetros y recursos externos no se cachean.
  if (url.origin !== self.location.origin || url.search) return;

  if (request.mode === 'navigate' || /\\.html?$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\\.(png|jpe?g|webp|svg|gif|css|js|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
