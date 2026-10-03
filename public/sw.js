/*
 * The app's service worker (2 Oct 2026) - for phone alerts only.
 *
 * Registered by the app at /agent (components/app/alerts) with scope /agent, so
 * it never touches the desktop OS or the phone site. No fetch handler on
 * purpose: nothing is cached, so a push to main is what every phone sees on
 * its next open, exactly as before. The message arrives already decrypted by
 * the browser (lib/web-push encrypts it): { title, body, href, badge }.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "TLE OS", body: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "TLE OS";
  const work = [
    self.registration.showNotification(title, {
      body: msg.body || "",
      icon: "/icons/m/icon-192.png",
      badge: "/icons/m/icon-192.png",
      data: { href: msg.href || "/agent" },
      tag: msg.href || undefined,
    }),
  ];
  /* The number on the home-screen icon, where the phone supports it. */
  if (typeof msg.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    work.push(msg.badge > 0 ? self.navigator.setAppBadge(msg.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(work).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/agent";
  const url = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w && w.url.startsWith(self.location.origin)) {
          return w.focus().then((f) => (f && "navigate" in f ? f.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
