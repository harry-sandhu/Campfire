/* Minimal service worker: makes the app installable and shows a friendly page when offline.
   API responses and pages are never cached, so data is always live and permission changes take effect immediately. */
const OFFLINE = new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div><h1>You are offline</h1><p>Campfire needs a connection. Reconnect and try again.</p><button onclick="location.reload()">Retry</button></div>',
  { headers: { "Content-Type": "text/html; charset=utf-8" } },
);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => OFFLINE.clone()));
});
