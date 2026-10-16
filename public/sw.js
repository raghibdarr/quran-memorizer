// v2 (static export): bumping the names makes activate() delete every v1 cache —
// pages and payloads from the old server-rendered build, and the unbounded pile of
// per-hash ?_rsc entries it accumulated.
const CACHE_STATIC = 'takrar-static-v2';
const CACHE_PAGES = 'takrar-pages-v2';
// Recitations downloaded for offline (src/lib/downloads.ts) — never cleared here
const CACHE_AUDIO = 'takrar-audio-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PAGES).then((cache) => cache.addAll(['/offline.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_PAGES, CACHE_AUDIO].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Downloaded recitations play from the cache, offline included
  if (url.origin !== self.location.origin) {
    if (/.mp3$/i.test(url.pathname)) event.respondWith(fromAudioCache(event.request));
    return;
  }

  // Static assets: cache-first (hashed filenames = immutable)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/logos/')
  ) {
    event.respondWith(cacheFirst(event.request, CACHE_STATIC));
    return;
  }

  // HTML navigation: network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(event.request));
    return;
  }

  // Router payloads (*.txt / ?_rsc): network-first. Stale-while-revalidate served
  // the PREVIOUS deploy's payload after every release — a build-id mismatch that
  // forced a full reload on the first visit to each route.
  if (url.pathname.endsWith('.txt') || url.searchParams.has('_rsc')) {
    event.respondWith(networkFirst(event.request, CACHE_PAGES));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request, CACHE_STATIC));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // ignoreSearch: one static page serves every lesson (/learn?s=&l=), so any
    // cached copy of it works offline for a lesson never opened before
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ---------- Web push reminders (M8) ----------
// Sent by netlify/functions/send-reminders.mts only when reviews are actually due.
// Payload: { title, body, url }. Tapping opens (or focuses) the app at that URL.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Takrar', {
      body: data.body || 'Your reviews are ready.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'takrar-daily', // one reminder at a time, the newest replaces the last
      data: { url: data.url || '/review' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/review', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});

// A downloaded recitation, honouring the Range requests media elements make
// (seeking, and slices of whole-surah files); anything not downloaded goes to the network
async function fromAudioCache(request) {
  const cache = await caches.open(CACHE_AUDIO);
  const hit = await cache.match(request.url);
  if (!hit) return fetch(request);
  const range = request.headers.get('Range');
  if (!range) return hit;
  const blob = await hit.blob();
  const m = /bytes=(d*)-(d*)/.exec(range);
  const size = blob.size;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
