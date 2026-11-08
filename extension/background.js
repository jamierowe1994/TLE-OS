// TLE OS for Propoly - the service worker.
//
// Propoly's page can't call TLE OS itself (a content script is held to the
// page's own cross-site rules), so it asks here and this asks TLE OS. The
// extension holds host permission for TLE OS, so the agent's own os_session
// cookie goes with each request: answers are theirs, scoped like the OS.
//
// Nothing here talks to Propoly.

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

async function call(path, init = {}) {
  const origin = await osOrigin();
  try {
    const res = await fetch(origin + path, {
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
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

/* Steve's chat for each tab, so it survives Propoly's page loads. Session
   storage: gone when Chrome closes, never shared with the page. */
const tabKey = (sender) => "tab:" + (sender && sender.tab ? sender.tab.id : "none");
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove("tab:" + tabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const type = msg && msg.type;
  if (type === "lookup") {
    call("/api/extension/deal?id=" + encodeURIComponent(String(msg.id || ""))).then(reply);
    return true;
  }
  if (type === "whoami") {
    call("/api/extension/deal").then(reply);
    return true;
  }
  if (type === "name") {
    call("/api/assistant/name").then(reply);
    return true;
  }
  if (type === "ask") {
    call("/api/assistant/ask", { method: "POST", body: JSON.stringify(msg.body || {}) }).then(reply);
    return true;
  }
  if (type === "state:get") {
    const key = tabKey(sender);
    chrome.storage.session
      .get(key)
      .then((v) => reply({ state: v[key] || null }))
      .catch(() => reply({ state: null }));
    return true;
  }
  if (type === "state:set") {
    chrome.storage.session
      .set({ [tabKey(sender)]: msg.state })
      .then(() => reply({ ok: true }))
      .catch(() => reply({ ok: false }));
    return true;
  }
  if (type === "open") {
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
