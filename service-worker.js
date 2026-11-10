
/* =========================================================
   CAMINO HACIA JESÚS
   Service Worker — Colegio Privado La Salle del Sur
   ========================================================= */

const CACHE_VERSION = 'camino-hacia-jesus-shell-v3';

/* Archivos esenciales para instalar la aplicación */
const CORE_FILES = [
  './',
  './index.html',
  './manifest.webmanifest'
];

/* Recursos adicionales: se almacenan si están disponibles */
const OPTIONAL_FILES = [
  './programacion.html',
  './catequizandos.html',
  './CATEQUISTA.html',
  './padres.html',
  './GestorPastoral.html',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './assets/apple-touch-icon.png'
];

/* =========================================================
   INSTALACIÓN
   ========================================================= */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Primero se guardan los archivos indispensables.
    await cache.addAll(CORE_FILES);

    // Los archivos opcionales no bloquean la instalación.
    await Promise.allSettled(
      OPTIONAL_FILES.map(async (archivo) => {
        try {
          await cache.add(archivo);
        } catch (error) {
          console.warn('Recurso pendiente de guardar:', archivo);
        }
      })
    );

    await self.skipWaiting();
  })());
});

/* =========================================================
   ACTIVACIÓN Y LIMPIEZA DE VERSIONES ANTERIORES
   ========================================================= */

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();

    await Promise.all(
      nombres
        .filter((nombre) =>
          nombre.startsWith('camino-hacia-jesus-shell-') &&
          nombre !== CACHE_VERSION
        )
        .map((nombre) => caches.delete(nombre))
    );

    await self.clients.claim();
  })());
});

/* =========================================================
   NAVEGACIÓN: PRIMERO INTERNET, LUEGO CACHÉ
   ========================================================= */

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;

  } catch (error) {
    const guardado = await cache.match(request);

    if (guardado) {
      return guardado;
    }

    const portada = await cache.match('./index.html');

    if (portada) {
      return portada;
    }

    throw error;
  }
}

/* =========================================================
   IMÁGENES Y RECURSOS: CACHÉ CON ACTUALIZACIÓN
   ========================================================= */

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const guardado = await cache.match(request);

  const actualizacion = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return guardado || await actualizacion || Response.error();
}

/* =========================================================
   INTERCEPTAR SOLICITUDES
   ========================================================= */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // No intervenir en formularios ni solicitudes POST.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Google Apps Script y otros servidores externos
  // deben responder directamente; no guardar sus datos.
  if (url.origin !== self.location.origin) {
    return;
  }

  // No almacenar solicitudes con parámetros.
  if (url.search) {
    return;
  }

  // Páginas y navegación.
  if (
    request.mode === 'navigate' ||
    /\.html?$/i.test(url.pathname)
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Recursos estáticos de la aplicación.
  if (
    /\.(png|jpe?g|webp|svg|gif|css|js|woff2?|webmanifest|json)$/i.test(
      url.pathname
    )
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
