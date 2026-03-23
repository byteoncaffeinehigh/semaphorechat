// Web Push service worker — replaces firebase-messaging-sw.js

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Semaphore", body: event.data.text() };
  }

  const title = payload.title || "Semaphore";
  const options = {
    body:  payload.body  || "",
    icon:  "/icon.svg",
    badge: "/icon.svg",
    data:  { link: payload.link || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return clients.openWindow(link);
    })
  );
});
