// TLE OS for Propoly - the service worker.
//
// The Propoly page can't call TLE OS itself (a content script is held to the
// page's own cross-site rules), so it asks here and this asks TLE OS. The
// extension holds host permission for TLE OS, so the agent's own os_session
// cookie goes with the request: the answer is theirs, scoped like the let page.
//
// Reads only. Nothing here talks to Propoly.

const DEFAULT_ORIGIN = "https://tle-os.co.uk";

async function osOrigin() {
  try {
    const { osOrigin } = await chrome.storage.local.get("osOrigin");
    const o = String(osOrigin || "").trim().replace(/\/+$/, "");
    return /^https?:\/\/[^/]+$/.test(o) ? o : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

async function ask(path) {
  const origin = await osOrigin();
  try {
    const res = await fetch(origin + path, {
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      headers: { accept: "application/json" },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { origin, status: res.status, body };
  } catch {
    return { origin, status: 0, body: null };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "lookup") {
    ask("/api/extension/deal?id=" + encodeURIComponent(String(msg.id || ""))).then(reply);
    return true;
  }
  if (msg && msg.type === "whoami") {
    ask("/api/extension/deal").then(reply);
    return true;
  }
  if (msg && msg.type === "open") {
    osOrigin().then((origin) => {
      /* Only ever a page on TLE OS itself: keep the path, use our own address. */
      let path = String(msg.path || "/sign-in");
      try {
        if (msg.url) {
          const u = new URL(String(msg.url));
          path = u.pathname + u.search;
        }
      } catch {
        /* keep the fallback */
      }
      chrome.tabs.create({ url: origin + (path.startsWith("/") ? path : "/" + path) });
      reply({ ok: true });
    });
    return true;
  }
  return false;
});
