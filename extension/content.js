// TLE OS for Propoly - the card on a Propoly deal page.
//
// Phase 1 (James, 8 Nov 2026): on tle.propoly.com/deals/<uuid>, say whether
// the deal is in TLE OS and link straight to the let. Agents kept asking
// "has my deal gone to Propoly?" and, once in Propoly, had nobody to ask.
//
// It reads the address bar and nothing else on Propoly's page, and never
// presses anything there. Drawn inside a shadow root so Propoly's styles and
// ours can't touch each other.

(() => {
  if (window.__tleOsCard) return;
  window.__tleOsCard = true;

  const DEAL = /\/deals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
  const dealId = () => (location.pathname.match(DEAL) || [])[1]?.toLowerCase() || null;

  /* ---------------------------------------------------------------- icons */
  const svg = (d, cls = "") =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const IC = {
    tick: svg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.6"),
    info: svg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01"),
    lock: svg("M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2"),
    warn: svg("M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01"),
    user: svg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"),
    open: svg("M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"),
    down: svg("M6 9l6 6 6-6"),
    up: svg("M6 15l6-6 6 6"),
    refresh: svg("M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"),
  };

  /* ---------------------------------------------------------------- styles */
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap {
      position: fixed; left: 20px; bottom: 20px; z-index: 2147483000;
      font-family: Inter, "Unitext", Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #141413; font-size: 13px; line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      width: 312px; max-width: calc(100vw - 40px);
      background: #f8f7f4; border: 1px solid rgba(20,20,19,.16);
      box-shadow: 0 12px 32px -12px rgba(20,20,19,.28), 0 2px 6px rgba(20,20,19,.08);
      animation: rise .22s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .card, .pill { animation: none; } .spin { animation-duration: 2s; } }
    .head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 12px 0 14px;
    }
    .brand { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: rgba(20,20,19,.58); font-weight: 500; }
    .btn-icon {
      all: unset; cursor: pointer; width: 26px; height: 26px; display: grid; place-items: center;
      color: rgba(20,20,19,.6);
    }
    .btn-icon:hover { color: #141413; background: rgba(20,20,19,.06); }
    .btn-icon:focus-visible { outline: 2px solid #a85a51; outline-offset: 1px; }
    .body { padding: 8px 14px 14px; }
    .title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 500; letter-spacing: 0; margin: 0; }
    .title .ic { width: 20px; height: 20px; flex: none; }
    .good { color: #56634a; }
    .note { color: #a85a51; }
    .bad { color: #8a463f; }
    .muted { color: rgba(20,20,19,.62); }
    .address { margin: 6px 0 0; font-size: 13.5px; }
    .text { margin: 6px 0 0; color: rgba(20,20,19,.72); }
    dl { margin: 12px 0 0; padding: 0; border-top: 1px solid rgba(20,20,19,.12); }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid rgba(20,20,19,.12); }
    dt { color: rgba(20,20,19,.58); font-size: 12px; flex: none; }
    dd { margin: 0; text-align: right; font-size: 12.5px; min-width: 0; overflow-wrap: anywhere; white-space: pre-line; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .btn {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 34px; padding: 0 14px; font-size: 13px; font-weight: 500;
      background: #56423e; color: #fff;
    }
    .btn:hover { background: color-mix(in srgb, #56423e 84%, #000); }
    .btn:focus-visible { outline: 2px solid #a85a51; outline-offset: 2px; }
    .btn .ic { width: 15px; height: 15px; }
    .btn.ghost { background: transparent; color: #141413; border: 1px solid rgba(20,20,19,.22); }
    .btn.ghost:hover { background: rgba(20,20,19,.05); }
    .loading { display: flex; align-items: center; gap: 10px; padding: 4px 0 2px; color: rgba(20,20,19,.7); }
    .spin {
      width: 16px; height: 16px; border-radius: 50%; flex: none;
      border: 2px solid rgba(86,66,62,.2); border-top-color: #56423e;
      animation: turn .8s linear infinite;
    }
    @keyframes turn { to { transform: rotate(360deg); } }
    .pill {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      height: 34px; padding: 0 12px 0 10px; background: #f8f7f4;
      border: 1px solid rgba(20,20,19,.16);
      box-shadow: 0 6px 18px -8px rgba(20,20,19,.3);
      font-size: 12.5px; font-weight: 500; color: #141413;
      animation: rise .18s ease-out;
    }
    .pill:hover { background: #fff; }
    .pill:focus-visible { outline: 2px solid #a85a51; outline-offset: 2px; }
    .pill .ic { width: 17px; height: 17px; }
    .pill .brand { margin-right: 2px; }
    .ic { display: block; }
    @media (prefers-color-scheme: dark) {
      .wrap { color: #f1efe9; }
      .card, .pill { background: #23201f; border-color: rgba(255,255,255,.14); color: #f1efe9; }
      .pill:hover { background: #2b2725; }
      .brand, dt, .muted { color: rgba(241,239,233,.6); }
      .text { color: rgba(241,239,233,.75); }
      dl, .row { border-color: rgba(255,255,255,.12); }
      .btn-icon { color: rgba(241,239,233,.65); }
      .btn-icon:hover { color: #fff; background: rgba(255,255,255,.08); }
      .btn { background: #c4a092; color: #1b1716; }
      .btn:hover { background: #d3b3a6; }
      .btn.ghost { color: #f1efe9; border-color: rgba(255,255,255,.22); background: transparent; }
      .good { color: #9fb08d; } .note { color: #d6907f; } .bad { color: #e09a90; }
      .spin { border-color: rgba(196,160,146,.25); border-top-color: #c4a092; }
      .loading { color: rgba(241,239,233,.75); }
    }
  `;

  /* ---------------------------------------------------------------- mount */
  const host = document.createElement("tle-os-card");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style><div class="wrap" role="region" aria-label="TLE OS"></div>`;
  const wrap = root.querySelector(".wrap");

  let current = null; // deal id on screen
  let state = { kind: "idle" };
  let collapsed = false;
  let asking = 0;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  try {
    chrome.storage.local.get("collapsed").then((v) => {
      collapsed = Boolean(v && v.collapsed);
      draw();
    });
  } catch {
    /* storage unavailable: start open */
  }
  const setCollapsed = (v) => {
    collapsed = v;
    try { chrome.storage.local.set({ collapsed: v }); } catch { /* fine */ }
    draw();
  };

  /* The short name on the pill, and the icon. */
  function summary() {
    switch (state.kind) {
      case "loading": return { icon: `<span class="spin" aria-hidden="true"></span>`, text: "Checking TLE OS" };
      case "yours":
      case "theirs": return { icon: `<span class="good">${IC.tick}</span>`, text: "In TLE OS" };
      case "missing": return { icon: `<span class="note">${IC.info}</span>`, text: "Not in TLE OS Yet" };
      case "signedOut": return { icon: `<span class="note">${IC.lock}</span>`, text: "Sign in to TLE OS" };
      default: return { icon: `<span class="bad">${IC.warn}</span>`, text: "Couldn't Reach TLE OS" };
    }
  }

  function bodyHtml() {
    const s = state;
    if (s.kind === "loading") {
      return `<div class="loading" role="status"><span class="spin" aria-hidden="true"></span>Checking TLE OS for this deal</div>`;
    }
    if (s.kind === "yours") {
      const d = s.deal;
      const rows = [
        ["Stage", d.stage],
        ["Tenants", (d.tenants || []).join(", ")],
        ["Move-in", day(d.moveIn)],
        ["Agent", d.agent],
        [
          "Pushed",
          d.pushed
            ? `From TLE OS${d.pushed.by ? " by " + d.pushed.by : ""}\n${day(d.pushed.at)}`
            : "Started in Propoly,\nnot pushed from TLE OS",
        ],
      ].filter(([, v]) => v);
      return `
        <p class="title"><span class="${d.cancelled ? "note" : "good"}">${d.cancelled ? IC.info : IC.tick}</span>In TLE OS</p>
        <p class="address">${esc(d.address)}</p>
        <dl>${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="actions"><button class="btn" data-act="openLet" type="button">${IC.open}Open in TLE OS</button></div>`;
    }
    if (s.kind === "theirs") {
      return `
        <p class="title"><span class="good">${IC.tick}</span>In TLE OS</p>
        <p class="text">This deal is on another agent's book, so its details stay with them.</p>`;
    }
    if (s.kind === "missing") {
      return `
        <p class="title"><span class="note">${IC.info}</span>Not in TLE OS Yet</p>
        <p class="text">TLE OS reads Propoly every few minutes. If this deal was started just now, it will show here shortly.</p>
        <div class="actions"><button class="btn ghost" data-act="retry" type="button">${IC.refresh}Check Again</button></div>`;
    }
    if (s.kind === "signedOut") {
      return `
        <p class="title"><span class="note">${IC.lock}</span>Sign in to TLE OS</p>
        <p class="text">Sign in once in this browser and this card will show the let for every Propoly deal you open.</p>
        <div class="actions">
          <button class="btn" data-act="signIn" type="button">${IC.user}Sign In</button>
          <button class="btn ghost" data-act="retry" type="button">Check Again</button>
        </div>`;
    }
    return `
      <p class="title"><span class="bad">${IC.warn}</span>Couldn't Reach TLE OS</p>
      <p class="text">${esc(s.message || "TLE OS didn't answer. Check your connection and try again.")}</p>
      <div class="actions"><button class="btn ghost" data-act="retry" type="button">${IC.refresh}Try Again</button></div>`;
  }

  function draw() {
    if (!current || state.kind === "idle") {
      host.remove();
      return;
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (collapsed) {
      const s = summary();
      wrap.innerHTML = `<button class="pill" data-act="expand" type="button" aria-label="${esc(s.text)}. Show the TLE OS card">${s.icon}<span class="brand">TLE OS</span>${esc(s.text)}</button>`;
      return;
    }
    wrap.innerHTML = `
      <section class="card" aria-live="polite">
        <div class="head">
          <span class="brand">TLE OS</span>
          <button class="btn-icon" data-act="collapse" type="button" aria-label="Make the card smaller">${IC.down}</button>
        </div>
        <div class="body">${bodyHtml()}</div>
      </section>`;
  }

  wrap.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.getAttribute("data-act");
    if (act === "collapse") setCollapsed(true);
    else if (act === "expand") setCollapsed(false);
    else if (act === "retry") lookup(true);
    else if (act === "openLet" && state.kind === "yours") send({ type: "open", url: state.deal.letUrl });
    else if (act === "signIn") send({ type: "open", path: "/sign-in" });
  });

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r));
      } catch {
        resolve(null);
      }
    });
  }

  /* ---------------------------------------------------------------- lookup */
  async function lookup(showLoading) {
    const id = current;
    if (!id) return;
    const n = ++asking;
    if (showLoading || state.kind === "idle") {
      state = { kind: "loading" };
      draw();
    }
    const r = await send({ type: "lookup", id });
    if (n !== asking || id !== current) return; // a newer page took over
    const b = (r && r.body) || {};
    if (!r || r.status === 0) {
      state = { kind: "error", message: "TLE OS didn't answer. Check your connection and try again." };
    } else if (r.status === 401 || b.signedIn === false || (r.status >= 300 && r.status < 400)) {
      state = { kind: "signedOut" };
    } else if (r.status === 200 && b.found === false) {
      state = { kind: "missing" };
    } else if (r.status === 200 && b.found && b.yours === false) {
      state = { kind: "theirs" };
    } else if (r.status === 200 && b.found && b.deal) {
      state = { kind: "yours", deal: b.deal };
    } else {
      state = { kind: "error", message: b.error || `TLE OS answered with an error (${r.status}). Try again in a minute.` };
    }
    draw();
  }

  /* Propoly moves between pages without a full load, so watch the address. */
  function check() {
    const id = dealId();
    if (id === current) return;
    current = id;
    state = { kind: "idle" };
    if (id) lookup(true);
    else draw();
  }
  check();
  setInterval(check, 800);
  window.addEventListener("popstate", check);

  /* Back from signing in, or from the let: ask again, quietly. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && current && state.kind !== "loading") lookup(false);
  });
})();
