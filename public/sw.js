const CACHE_NAME = "mechpro-v2";
const urlsToCache = ["/", "/icon/icon-192.png", "/icon/icon-512.png"];

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Never intercept cross-origin requests
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never intercept auth paths
  if (url.pathname.startsWith("/auth")) return;

  // Handle navigation requests
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  // Network-first for other same-origin GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.map((name) => { if (name !== CACHE_NAME) return caches.delete(name); }))
      )
      .then(() => self.clients.claim())
  );
});

// Handle push notifications - only show if app is not in focus
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const isAppInFocus = clientList.some((client) => client.focused);
      if (!isAppInFocus) {
        return self.registration.showNotification(data.title ?? "MechPro", {
          body: data.body ?? "",
          icon: "/icon/icon-192.png",
          badge: "/icon/icon-192.png",
          ...data.options,
        });
      }
    })
  );
});

// Handle notification clicks - opens/focuses the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
