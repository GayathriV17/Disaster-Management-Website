const CACHE_NAME = "rescuehub-shell-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/alerts.html",
  "/report.html",
  "/shelters.html",
  "/sos.html",
  "/safety.html",
  "/admin.html",
  "/shared.css",
  "/style.css",
  "/sos.css",
  "/script.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
