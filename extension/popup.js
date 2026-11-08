// The toolbar pop-up: who TLE OS thinks you are, and a sign-in button if nobody.

const status = document.getElementById("status");
const input = document.getElementById("origin");
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.6"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2"/></svg>';
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function show() {
  status.innerHTML = '<h1><span class="spin" aria-hidden="true"></span>Checking</h1>';
  chrome.runtime.sendMessage({ type: "whoami" }, (r) => {
    const b = (r && r.body) || {};
    if (r && r.status === 200 && b.signedIn) {
      status.innerHTML = `<h1><span class="good">${TICK}</span>Signed In</h1>
        <p>As ${esc(b.me && b.me.name)}. Open any deal in Propoly and the TLE OS card shows in the bottom corner.</p>`;
    } else if (r && r.status === 404) {
      status.innerHTML = `<h1><span class="note">${LOCK}</span>Not Switched On Yet</h1>
        <p>TLE OS at ${esc(r.origin)} doesn't have the extension's side yet. It will work once the latest TLE OS is live.</p>`;
    } else if (r && r.status !== 0 && r.status !== 401 && !(r.status >= 300 && r.status < 400)) {
      status.innerHTML = `<h1><span class="note">${LOCK}</span>Couldn't Reach TLE OS</h1>
        <p>${esc(b.error || `TLE OS answered with an error (${r.status}). Try again in a minute.`)}</p>`;
    } else if (r && r.status !== 0) {
      status.innerHTML = `<h1><span class="note">${LOCK}</span>Sign in to TLE OS</h1>
        <p>Sign in once in this browser and the card will show on every Propoly deal you open.</p>
        <button class="btn" id="signin" type="button">Sign In</button>`;
      document.getElementById("signin").onclick = () => chrome.runtime.sendMessage({ type: "open", path: "/sign-in" });
    } else {
      status.innerHTML = `<h1><span class="note">${LOCK}</span>Couldn't Reach TLE OS</h1>
        <p>TLE OS didn't answer at ${esc(r && r.origin)}. Check your connection and try again.</p>`;
    }
  });
}

/* Chrome focuses the first control when the pop-up opens, which drew a ring
   round "For testing" (James, 8 Nov 2026). Nothing needs the focus at first. */
requestAnimationFrame(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());

chrome.storage.local.get("osOrigin").then((v) => {
  input.value = (v && v.osOrigin) || "";
  show();
});
input.addEventListener("change", () => {
  const o = input.value.trim().replace(/\/+$/, "");
  chrome.storage.local.set({ osOrigin: o }).then(show);
});
