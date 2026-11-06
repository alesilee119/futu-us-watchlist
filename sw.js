// Bump CACHE_VERSION when the app shell changes. data/watchlist.json is
// network-first under a stable cache key, so a new snapshot replaces the old
// one instead of sticking around for the life of an older cache name.
const CACHE_VERSION = "v2";
const CACHE_NAME = `futu-us-watchlist-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isWatchlist(url)) {
    event.respondWith(networkFirstData(request, url));
    return;
  }

  // Leave the Vite dev server's module graph alone. Built assets live under
  // /assets and still use the network-first path below.
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.includes("@vite")
  ) {
    return;
  }

  event.respondWith(networkFirstAsset(request));
});

function isWatchlist(url) {
  return /(?:^|\/)data\/watchlist\.json$/.test(url.pathname);
}

async function networkFirstData(request, url) {
  const cacheKey = new Request(new URL(url.pathname, url.origin).toString(), { method: "GET" });
  try {
    const fresh = await fetch(request.url, { method: "GET", cache: "no-store" });
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, fresh.clone());
    }
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey);
    if (!cached) {
      return new Response("Offline", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const headers = new Headers(cached.headers);
    headers.set("X-Watchlist-Cache", "hit");
    headers.set("Cache-Control", "no-store");
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
}

async function networkFirstAsset(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
