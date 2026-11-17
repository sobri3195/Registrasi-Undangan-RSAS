/* Version injected from the production build. Only public application assets are cached. */
const VERSION = '__CACHE_VERSION__'
const CACHE = `rsas-shell-${VERSION}`
const ASSETS = /* __ASSETS__ */ []
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)))
  // Never skipWaiting automatically during registration.
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('rsas-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_OFFLINE') {
    event.waitUntil(
      caches.open(CACHE).then(async (cache) => {
        const present = await Promise.all(
          ASSETS.map((asset) => cache.match(asset)),
        )
        event.ports[0]?.postMessage({
          ready: ASSETS.length > 0 && present.every(Boolean),
          version: VERSION,
        })
      }),
    )
  }
  if (event.data === 'ACTIVATE_AFTER_SESSION') self.skipWaiting()
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match('/index.html'))
        .then((shell) => shell || fetch(event.request)),
    )
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(url.pathname))
        .then((asset) => asset || fetch(event.request)),
    )
  }
})
