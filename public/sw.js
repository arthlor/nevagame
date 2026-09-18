// Neva Land PWA service worker.
//
// This worker is intentionally a pass-through: browsers that still gate the
// install prompt on a `fetch` listener get one, while every request continues
// to hit the network so builds, saves and model loads are never served stale
// from a cache. Add caching here only alongside an explicit offline design.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op fetch handler: request falls through to the network.
});
