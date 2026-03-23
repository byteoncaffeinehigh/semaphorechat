importScripts("https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDDSxnKEIFLjJ4wU96eDzK-Wp5SZUWVSIE",
  authDomain: "antares-chat-cb1f0.firebaseapp.com",
  projectId: "antares-chat-cb1f0",
  storageBucket: "antares-chat-cb1f0.firebasestorage.app",
  messagingSenderId: "280329423628",
  appId: "1:280329423628:web:f8fb6c50a01741d96bd729",
});

const messaging = firebase.messaging();

// FCM automatically displays notifications when the payload contains a
// notification field. onBackgroundMessage is only needed for data-only messages.
messaging.onBackgroundMessage((_payload) => {});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.FCM_MSG?.fcmOptions?.link || "/";
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
