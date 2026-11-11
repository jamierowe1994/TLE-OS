// TLE OS for Propoly - Steve in the corner of Propoly.
//
// James, 8 Nov 2026: "Steve sat on Propoly, helping them guide through the
// different things on the screens ... if Propoly's website is open on the
// screen, Steve will show."
//
//  - Steve's orb sits bottom-right on every tle.propoly.com page.
//  - On a deal page, a chip beside him says whether the deal is in TLE OS
//    (phase 1's card, folded in), and the chat opens with the deal's facts.
//  - The chat is the OS's own Steve (/api/assistant/ask, site "propoly"),
//    signed in as the agent, with the same memory and the same access.
//  - He reads the buttons and boxes on Propoly's screen so he can say where
//    to click. When he would "do it on screen" in the OS, here he only
//    HIGHLIGHTS each control in turn for the agent's own hands. Nothing in
//    this file ever clicks, types into or changes anything on Propoly.
//
// Drawn inside a closed shadow root so Propoly's styles and ours can't touch.

(() => {
  if (window.__tleOsSteve) return;
  window.__tleOsSteve = true;

  const DEAL = /\/deals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
  const dealId = () => (location.pathname.match(DEAL) || [])[1]?.toLowerCase() || null;

  /* ---------------------------------------------------------------- icons */
  const svg = (d) =>
    `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const IC = {
    tick: svg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.6"),
    info: svg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01"),
    lock: svg("M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2"),
    warn: svg("M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01"),
    user: svg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"),
    open: svg("M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"),
    cross: svg("M6 6l12 12M18 6L6 18"),
    send: svg("M12 19V5M6 11l6-6 6 6"),
    refresh: svg("M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"),
    point: svg("M9 11V4.5a1.5 1.5 0 0 1 3 0V10M12 9.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 14a1.5 1.5 0 0 1 2.4-1.8L9 15"),
  };

  /* ---------------------------------------------------------------- styles */
  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      --bg: #f8f7f4; --card: #fff; --ink: #141413; --soft: rgba(20,20,19,.62); --faint: rgba(20,20,19,.45);
      --line: rgba(20,20,19,.14); --btn: #56423e; --on: #fff; --accent: #a85a51; --good: #56634a;
      --wash: rgba(86,66,62,.09);
      font-family: Inter, "Unitext", Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--ink); font-size: 13.5px; line-height: 1.5; -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      .root { --bg: #23201f; --card: #2b2725; --ink: #f1efe9; --soft: rgba(241,239,233,.66); --faint: rgba(241,239,233,.45);
        --line: rgba(255,255,255,.14); --btn: #c4a092; --on: #1b1716; --accent: #d6907f; --good: #9fb08d; --wash: rgba(196,160,146,.12); }
    }
    .ic { display: block; width: 16px; height: 16px; flex: none; }
    button { font: inherit; }

    /* Steve and the chip, bottom right. */
    .dock { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 10px; }
    .chip {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 10px;
      background: var(--bg); color: var(--ink); border: 1px solid var(--line); font-size: 12.5px; font-weight: 500;
      box-shadow: 0 6px 18px -8px rgba(20,20,19,.3); animation: rise .2s ease-out; white-space: nowrap;
    }
    .chip:hover { filter: brightness(1.02); }
    .chip:focus-visible, .orbbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .chip .ic { width: 16px; height: 16px; }
    .chip .spin { width: 13px; height: 13px; }
    .orbbtn { all: unset; cursor: pointer; display: block; border-radius: 50%; }
    .good { color: var(--good); } .note { color: var(--accent); }

    /* Steve as the orb (from the OS: app/new-look/steve-orb.css, "Quiet Ink"). */
    .sorb { position: relative; display: inline-block; flex: none; isolation: isolate; width: var(--s); height: var(--s); }
    .sorb-ball { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; -webkit-mask-image: radial-gradient(#fff, #000);
      transform: translateZ(0); background: radial-gradient(circle at 50% 50%, #5e4842 0%, #56423e 40%, #4a3835 72%, #3e2f2c 100%);
      animation: sorb-breathe 6.5s ease-in-out infinite; }
    .sorb::before { content: ""; position: absolute; inset: 2%; border-radius: 50%; pointer-events: none; z-index: -1;
      box-shadow: 0 0 calc(var(--s) * .2) calc(var(--s) * .01) rgba(86,66,62,.28), 0 calc(var(--s) * .06) calc(var(--s) * .2) rgba(62,47,44,.24); }
    .sorb-o { position: absolute; left: 50%; top: 50%; width: 0; height: 0; animation: sorb-orbit linear infinite; }
    .sorb-o i { position: absolute; display: block; border-radius: 50%; width: calc(var(--s) * var(--w)); height: calc(var(--s) * var(--w));
      left: calc(var(--s) * var(--w) / -2 + var(--s) * var(--r)); top: calc(var(--s) * var(--w) / -2);
      background: radial-gradient(circle, var(--c) 0%, color-mix(in srgb, var(--c) 72%, transparent) 24%, color-mix(in srgb, var(--c) 32%, transparent) 46%, transparent 68%);
      opacity: var(--a, .9); animation: sorb-swell ease-in-out infinite alternate; animation-duration: var(--sw); }
    .o1 { --c: #6e5650; --w: .8; --r: .1; --sw: 3.8s; animation-duration: 9s; }
    .o2 { --c: #3a2b28; --w: .62; --r: .2; --sw: 4.6s; animation-duration: 12s; animation-direction: reverse; animation-delay: -4s; }
    .o3 { --c: #a85a51; --w: .6; --r: .24; --sw: 3.2s; animation-duration: 7.5s; animation-delay: -2s; --a: .42; }
    .o4 { --c: #2e2321; --w: .4; --r: .14; --sw: 5.4s; animation-duration: 15s; animation-delay: -9s; --a: .6; }
    .o5 { --c: #7d645c; --w: .5; --r: .28; --sw: 2.8s; animation-duration: 10s; animation-direction: reverse; animation-delay: -6s; --a: .5; }
    .sorb-grain { position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
      background: radial-gradient(circle, rgba(196,160,146,0) 62%, rgba(196,160,146,.14) 84%, rgba(245,239,230,.32) 98%); }
    .sorb-eyes { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; animation: sorb-look 11s ease-in-out infinite; }
    .sorb-gaze { display: flex; align-items: center; gap: calc(var(--s) * .13); }
    .sorb-eyes i { display: block; width: calc(var(--s) * .095); height: calc(var(--s) * .22); border-radius: 999px; background: #f5efe6;
      box-shadow: 0 calc(var(--s) * .01) calc(var(--s) * .04) rgba(0,0,0,.25); animation: sorb-blink 5.5s infinite; }
    .orbbtn:hover .sorb-ball { filter: saturate(1.12) brightness(1.04); }
    .sorb.thinking .sorb-ball { animation: sorb-breathe 2.4s ease-in-out infinite, sorb-liquid 2.4s ease-in-out infinite; }
    .sorb.thinking .sorb-eyes { animation: none; }
    .sorb.thinking .sorb-eyes i { animation: sorb-think .9s ease-in-out infinite; }
    .sorb.thinking .sorb-eyes i:last-child { animation-delay: -.45s; }
    .sorb.thinking::after { content: ""; position: absolute; inset: -16%; border-radius: 50%; z-index: -2; pointer-events: none;
      background: radial-gradient(circle, rgba(168,90,81,.3) 0%, rgba(168,90,81,.1) 45%, rgba(168,90,81,0) 70%); animation: sorb-glow 1.6s ease-in-out infinite; }
    @keyframes sorb-orbit { to { transform: rotate(360deg); } }
    @keyframes sorb-swell { from { transform: scale(.8); } to { transform: scale(1.2); } }
    @keyframes sorb-breathe { 0%,100% { transform: translateZ(0) scale(1); } 50% { transform: translateZ(0) translateY(-1%) scale(1.015); } }
    @keyframes sorb-liquid { 0%,100% { border-radius: 50%; } 25% { border-radius: 52% 48% 51% 49% / 49% 52% 48% 51%; } 50% { border-radius: 48% 52% 49% 51% / 52% 48% 51% 49%; } 75% { border-radius: 51% 49% 52% 48% / 48% 51% 49% 52%; } }
    @keyframes sorb-blink { 0%, 93%, 100% { transform: scaleY(1); } 95.5% { transform: scaleY(.12); } }
    @keyframes sorb-look { 0%,30%,100% { transform: none; } 38%,52% { transform: translate(calc(var(--s) * .025), calc(var(--s) * -.01)); } 60%,74% { transform: translate(calc(var(--s) * -.025), calc(var(--s) * .005)); } }
    @keyframes sorb-think { 0%,100% { transform: translateY(calc(var(--s) * -.02)) scaleY(.85); } 50% { transform: translateY(calc(var(--s) * .02)) scaleY(1); } }
    @keyframes sorb-glow { 0%,100% { opacity: .5; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes turn { to { transform: rotate(360deg); } }

    /* His chat, above him. */
    .panel {
      position: fixed; right: 20px; bottom: 86px; z-index: 2147483000;
      width: 380px; max-width: calc(100vw - 24px); height: min(620px, calc(100vh - 120px));
      display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line);
      box-shadow: 0 24px 60px -24px rgba(20,20,19,.38), 0 2px 10px -4px rgba(0,0,0,.08);
      transform-origin: 92% 100%; animation: pop .26s cubic-bezier(.2,.9,.3,1);
    }
    @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
    .head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--line); }
    .who { flex: 1; min-width: 0; }
    .name { font-size: 16px; font-weight: 500; letter-spacing: 0; margin: 0; }
    .where { font-size: 11.5px; color: var(--faint); margin: 0; }
    .x { all: unset; cursor: pointer; width: 30px; height: 30px; display: grid; place-items: center; color: var(--soft); }
    .x:hover { background: var(--wash); color: var(--ink); }
    .x:focus-visible { outline: 2px solid var(--accent); }

    .deal { padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--card); }
    .deal-top { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .deal-top .ic { width: 18px; height: 18px; }
    .deal-stage { margin-left: auto; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--soft); font-weight: 500; }
    .deal p { margin: 4px 0 0; color: var(--soft); font-size: 12.5px; }
    .deal .addr { color: var(--ink); font-size: 13.5px; }
    .deal-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }

    .msgs { flex: 1; overflow-y: auto; padding: 14px 16px 6px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
    .m { max-width: 92%; padding: 9px 12px; overflow-wrap: anywhere; }
    .m p { margin: 0; } .m p + p, .m ul + p, .m p + ul { margin-top: 6px; }
    .m ul { margin: 4px 0 0; padding-left: 18px; } .m li + li { margin-top: 2px; }
    .steve { align-self: flex-start; background: var(--wash); }
    .me { align-self: flex-end; background: var(--card); border: 1px solid var(--line); }
    .m a, .linkbtn { all: unset; cursor: pointer; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
    .m-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px 14px; background: var(--wash); }
    .typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--soft); animation: dot 1.2s infinite ease-in-out; }
    .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
    @keyframes dot { 0%, 60%, 100% { opacity: .3; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px; }
    .chips button { all: unset; cursor: pointer; font-size: 12.5px; padding: 6px 11px; border: 1px solid var(--line); background: var(--card); }
    .chips button:hover { border-color: var(--accent); }
    .chips button:focus-visible { outline: 2px solid var(--accent); }

    .ask { display: flex; align-items: flex-end; gap: 8px; margin: 0 12px 12px; padding: 8px 8px 8px 12px; border: 1px solid var(--line); background: var(--card); }
    .ask:focus-within { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
    textarea { all: unset; flex: 1; min-height: 40px; max-height: 120px; font: inherit; font-size: 14px; color: var(--ink); white-space: pre-wrap; overflow-y: auto; }
    textarea::placeholder { color: var(--faint); }
    .send { all: unset; cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--btn); color: var(--on); flex: none; }
    .send[disabled] { opacity: .4; cursor: default; }
    .send:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .fine { font-size: 11px; color: var(--faint); margin: -6px 16px 10px; }

    .btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; font-size: 12.5px; font-weight: 500; background: var(--btn); color: var(--on); }
    .btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn .ic { width: 15px; height: 15px; }
    .spin { width: 16px; height: 16px; border-radius: 50%; flex: none; border: 2px solid var(--wash); border-top-color: var(--btn); animation: turn .8s linear infinite; }
    .center { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 24px; gap: 6px; }
    .center h2 { font-size: 17px; font-weight: 500; letter-spacing: 0; margin: 0; display: flex; align-items: center; gap: 8px; }
    .center p { margin: 0; color: var(--soft); }

    /* Pointing at a control on Propoly's page: a ring and a note, nothing pressed. */
    .ring { position: fixed; z-index: 2147482999; pointer-events: none; border: 2px solid #a85a51; border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(168,90,81,.22), 0 0 0 9999px rgba(20,20,19,.10); transition: all .18s ease-out; }
    .ring::after { content: ""; position: absolute; inset: -8px; border-radius: 10px; border: 2px solid rgba(168,90,81,.5); animation: ping 1.4s ease-out infinite; }
    @keyframes ping { from { opacity: 1; transform: scale(.96); } to { opacity: 0; transform: scale(1.08); } }
    .tip { position: fixed; z-index: 2147483001; width: 280px; max-width: calc(100vw - 24px); background: var(--bg); border: 1px solid var(--line);
      box-shadow: 0 16px 40px -16px rgba(20,20,19,.4); padding: 12px 14px; animation: rise .18s ease-out; }
    .tip .step { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); font-weight: 500; }
    .tip .says { margin: 4px 0 0; font-size: 14px; font-weight: 500; display: flex; gap: 8px; align-items: flex-start; }
    .tip .says .ic { width: 18px; height: 18px; color: var(--accent); margin-top: 1px; }
    .tip .yours { margin: 4px 0 0; color: var(--soft); font-size: 12px; }
    .tip .row { display: flex; gap: 8px; margin-top: 10px; }

    @media (prefers-reduced-motion: reduce) {
      .sorb-ball, .sorb-o, .sorb-o i, .sorb-eyes, .sorb-eyes i, .sorb.thinking::after, .ring::after, .panel, .chip, .tip { animation: none !important; }
      .ring { transition: none; }
    }
  `;

  const orb = (size, cls = "") =>
    `<span class="sorb ${cls}" style="--s:${size}px" aria-hidden="true"><span class="sorb-ball"><span class="sorb-o o1"><i></i></span><span class="sorb-o o2"><i></i></span><span class="sorb-o o3"><i></i></span><span class="sorb-o o4"><i></i></span><span class="sorb-o o5"><i></i></span><span class="sorb-grain"></span></span><span class="sorb-eyes"><span class="sorb-gaze"><i></i><i></i></span></span></span>`;

  /* ---------------------------------------------------------------- mount */
  const host = document.createElement("tle-os-steve");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>${STYLES}</style><div class="root"><div class="dock"></div><div class="panel-slot"></div><div class="point-slot"></div></div>`;
  const $dock = shadow.querySelector(".dock");
  const $panel = shadow.querySelector(".panel-slot");
  const $point = shadow.querySelector(".point-slot");
  document.documentElement.appendChild(host);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r));
      } catch {
        resolve(null);
      }
    });

  /* ---------------------------------------------------------------- state */
  let current = dealId(); // deal on screen
  let deal = { kind: current ? "loading" : "none" }; // what TLE OS says about it
  let me = { kind: "loading" }; // signed in? and Steve's name
  let chat = { open: false, thread: "pp-" + Date.now().toString(36), messages: [] };
  let busy = false;
  let draft = "";
  let pointing = null; // { steps, i, refs }
  let refs = new Map(); // ref -> element, from the last snapshot sent

  /* The chat survives Propoly's page loads: kept per tab by the extension. */
  const save = () => send({ type: "state:set", state: { open: chat.open, thread: chat.thread, messages: chat.messages.slice(-40) } });

  /* ---------------------------------------------------------------- reading Propoly's screen */
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  };
  const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria, 70);
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return clean(l.innerText, 70);
    }
    const wrap = el.closest("label");
    if (wrap && wrap !== el) return clean(wrap.innerText, 70);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return clean(el.placeholder || el.name || el.title, 70);
    return clean(el.innerText || el.value || el.title, 70);
  }
  function kindOf(el) {
    const t = el.tagName;
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (t === "SELECT") return "select";
    if (t === "TEXTAREA") return "textarea";
    if (t === "INPUT") {
      if (type === "checkbox" || type === "radio") return "checkbox";
      if (type === "date" || type === "datetime-local") return "date";
      if (type === "number") return "number";
      if (type === "submit" || type === "button") return "button";
      return "text";
    }
    if (el.getAttribute("role") === "tab") return "tab";
    if (t === "A" || el.getAttribute("role") === "link") return "link";
    return "button";
  }
  function snapshot() {
    refs = new Map();
    const els = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="link"]')]
      .filter((el) => !host.contains(el) && visible(el));
    const vh = window.innerHeight;
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; };
    els.sort((a, b) => Number(inView(b)) - Number(inView(a)));
    const controls = [];
    for (const el of els) {
      if (controls.length >= 90) break;
      const label = labelOf(el);
      if (!label) continue;
      const kind = kindOf(el);
      const ref = "s" + (controls.length + 1);
      refs.set(ref, el);
      const c = { ref, kind, label };
      if (kind === "checkbox") c.value = el.checked ? "ticked" : "not ticked";
      else if (kind === "select") {
        c.value = clean(el.options[el.selectedIndex]?.text, 120);
        c.options = [...el.options].slice(0, 14).map((o) => clean(o.text, 40));
      } else if (/^(text|textarea|number|date)$/.test(kind)) c.value = clean(el.value, 120);
      controls.push(c);
    }
    const headings = [...document.querySelectorAll("h1, h2, h3")].filter((h) => !host.contains(h) && visible(h)).slice(0, 14).map((h) => clean(h.innerText, 60));
    return { title: clean(document.title, 100), headings, controls };
  }

  /* ---------------------------------------------------------------- his words */
  function md(text) {
    const lines = esc(text).split(/\n/);
    const out = [];
    let list = null;
    const inline = (s) =>
      s
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, t, href) => `<button class="linkbtn" type="button" data-act="os" data-href="${href}">${t}</button>`)
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1");
    for (const raw of lines) {
      const li = raw.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (li) {
        if (!list) { list = []; }
        list.push(`<li>${inline(li[1])}</li>`);
        continue;
      }
      if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
      if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
    }
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    return out.join("");
  }

  /* ---------------------------------------------------------------- drawing */
  function chipHtml() {
    if (!current || me.kind === "signedOut") return "";
    const k = deal.kind;
    if (k === "loading") return `<button class="chip" data-act="open" type="button"><span class="spin" aria-hidden="true"></span>Checking TLE OS</button>`;
    if (k === "yours" || k === "theirs") return `<button class="chip" data-act="open" type="button"><span class="good">${IC.tick}</span>In TLE OS</button>`;
    if (k === "missing") return `<button class="chip" data-act="open" type="button"><span class="note">${IC.info}</span>Not in TLE OS Yet</button>`;
    if (k === "error") return `<button class="chip" data-act="open" type="button"><span class="note">${IC.warn}</span>Couldn't Reach TLE OS</button>`;
    return "";
  }

  function dealHtml() {
    if (!current) return "";
    const k = deal.kind;
    if (k === "loading") return `<div class="deal" role="status"><div class="deal-top"><span class="spin" aria-hidden="true"></span>Checking TLE OS for this deal</div></div>`;
    if (k === "yours") {
      const d = deal.deal;
      const how = d.pushed ? `Pushed from TLE OS${d.pushed.by ? " by " + esc(d.pushed.by) : ""}, ${day(d.pushed.at)}` : "Started in Propoly, not pushed from TLE OS";
      const people = (d.tenants || []).length ? esc(d.tenants.join(", ")) + (d.moveIn ? ` · moving in ${day(d.moveIn)}` : "") : "";
      return `<div class="deal">
        <div class="deal-top"><span class="${d.cancelled ? "note" : "good"}">${d.cancelled ? IC.info : IC.tick}</span>In TLE OS<span class="deal-stage">${esc(d.stage)}</span></div>
        <p class="addr">${esc(d.address)}</p>${people ? `<p>${people}</p>` : ""}<p>${how}</p>
        <div class="deal-actions"><button class="btn ghost" data-act="os" data-href="${esc(new URL(d.letUrl).pathname)}" type="button">${IC.open}Open in TLE OS</button></div>
      </div>`;
    }
    if (k === "theirs") return `<div class="deal"><div class="deal-top"><span class="good">${IC.tick}</span>In TLE OS</div><p>This deal is on another agent's book, so its details stay with them.</p></div>`;
    if (k === "missing")
      return `<div class="deal"><div class="deal-top"><span class="note">${IC.info}</span>Not in TLE OS Yet</div><p>TLE OS reads Propoly every few minutes. If this deal was started just now, it will show shortly.</p>
        <div class="deal-actions"><button class="btn ghost" data-act="recheck" type="button">${IC.refresh}Check Again</button></div></div>`;
    return `<div class="deal"><div class="deal-top"><span class="note">${IC.warn}</span>Couldn't Reach TLE OS</div><p>${esc(deal.message || "Try again in a minute.")}</p>
      <div class="deal-actions"><button class="btn ghost" data-act="recheck" type="button">${IC.refresh}Try Again</button></div></div>`;
  }

  function startersFor() {
    return current
      ? ["What's left to do on this deal?", "Help me push this deal on", "Where do I start referencing?"]
      : ["How do I find a deal?", "What do I do in Propoly after Push to Propoly?"];
  }

  function messagesHtml() {
    const first = (me.person || "").split(" ")[0];
    const greet = chat.messages.length
      ? ""
      : `<div class="m steve"><p>Hi${first ? " " + esc(first) : ""}. I'm here on Propoly too. Ask me about this ${current ? "deal" : "screen"}, or how to do something here, and I'll point you to the right button.</p></div>`;
    const list = chat.messages
      .map((m, i) => {
        if (m.role === "me") return `<div class="m me"><p>${esc(m.text)}</p></div>`;
        const acts = [];
        if (m.steps && m.steps.length) acts.push(`<button class="btn" type="button" data-act="point" data-i="${i}">${IC.point}Show me</button>`);
        if (m.open) acts.push(`<button class="btn ghost" type="button" data-act="os" data-href="${esc(m.open.href)}">${IC.open}${esc(m.open.label || "Open in TLE OS")}</button>`);
        return `<div class="m steve">${md(m.text)}${acts.length ? `<div class="m-actions">${acts.join("")}</div>` : ""}</div>`;
      })
      .join("");
    return greet + list + (busy ? `<div class="typing" role="status" aria-label="${esc(me.name || "Steve")} is thinking"><i></i><i></i><i></i></div>` : "");
  }

  function panelHtml() {
    const name = esc(me.name || "Steve");
    const head = `<div class="head">${orb(30, busy ? "thinking" : "")}<div class="who"><p class="name">${name}</p><p class="where">On Propoly, from TLE OS</p></div>
      <button class="x" data-act="close" type="button" aria-label="Close ${name}">${IC.cross}</button></div>`;
    if (me.kind === "loading") return `<section class="panel" role="dialog" aria-label="${name}">${head}<div class="center" role="status"><h2><span class="spin" aria-hidden="true"></span>Connecting to TLE OS</h2></div></section>`;
    if (me.kind === "signedOut")
      return `<section class="panel" role="dialog" aria-label="${name}">${head}<div class="center"><h2><span class="note">${IC.lock}</span>Sign in to TLE OS</h2>
        <p>Sign in once in this browser and ${name} will be here on every Propoly page, knowing your deals.</p>
        <div class="deal-actions"><button class="btn" data-act="signIn" type="button">${IC.user}Sign In</button><button class="btn ghost" data-act="recheck" type="button">Check Again</button></div></div></section>`;
    if (me.kind === "error")
      return `<section class="panel" role="dialog" aria-label="${name}">${head}<div class="center"><h2><span class="note">${IC.warn}</span>Couldn't Reach TLE OS</h2>
        <p>${esc(me.message || "Check your connection and try again.")}</p><div class="deal-actions"><button class="btn ghost" data-act="recheck" type="button">${IC.refresh}Try Again</button></div></div></section>`;
    const chips = chat.messages.length || busy ? "" : `<div class="chips">${startersFor().map((s) => `<button type="button" data-act="starter">${esc(s)}</button>`).join("")}</div>`;
    return `<section class="panel" role="dialog" aria-label="${name}">${head}${dealHtml()}
      <div class="msgs" aria-live="polite">${messagesHtml()}</div>${chips}
      <div class="ask"><textarea rows="2" placeholder="Ask ${name}" aria-label="Ask ${name}">${esc(draft)}</textarea>
        <button class="send" data-act="send" type="button" aria-label="Send" ${busy ? "disabled" : ""}>${IC.send}</button></div>
      <p class="fine">${name} points at Propoly's buttons. Pressing them is yours.</p></section>`;
  }

  function draw() {
    $dock.innerHTML = `${chipHtml()}<button class="orbbtn" data-act="toggle" type="button" aria-label="${chat.open ? "Close" : "Open"} ${esc(me.name || "Steve")}" aria-expanded="${chat.open}">${orb(52, busy ? "thinking" : "")}</button>`;
    const hadFocus = shadow.activeElement && shadow.activeElement.tagName === "TEXTAREA";
    $panel.innerHTML = chat.open ? panelHtml() : "";
    const msgs = shadow.querySelector(".msgs");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const ta = shadow.querySelector("textarea");
    if (ta) {
      ta.addEventListener("input", () => { draft = ta.value; });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(ta.value); }
      });
      if (hadFocus || chat.justOpened) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
    chat.justOpened = false;
  }

  /* ---------------------------------------------------------------- talking to TLE OS */
  async function lookupDeal() {
    const id = current;
    if (!id) { deal = { kind: "none" }; draw(); return; }
    deal = { kind: "loading" };
    draw();
    const r = await send({ type: "lookup", id });
    if (id !== current) return;
    const b = (r && r.body) || {};
    if (!r || r.status === 0) deal = { kind: "error", message: "TLE OS didn't answer. Check your connection." };
    else if (r.status === 401 || b.signedIn === false) { deal = { kind: "none" }; me = { kind: "signedOut" }; }
    else if (r.status === 404) deal = { kind: "error", message: "TLE OS doesn't have the extension's side yet." };
    else if (r.status === 200 && b.found === false) deal = { kind: "missing" };
    else if (r.status === 200 && b.found && b.yours === false) deal = { kind: "theirs" };
    else if (r.status === 200 && b.found && b.deal) deal = { kind: "yours", deal: b.deal };
    else deal = { kind: "error", message: b.error || `TLE OS answered with an error (${r.status}).` };
    draw();
  }

  async function whoAmI() {
    const r = await send({ type: "whoami" });
    const b = (r && r.body) || {};
    if (!r || r.status === 0) me = { kind: "error", message: "TLE OS didn't answer. Check your connection and try again." };
    else if (r.status === 200 && b.signedIn) {
      const n = await send({ type: "name" });
      me = { kind: "ok", name: (n && n.body && n.body.name) || "Steve", person: b.me && b.me.name };
    } else if (r.status === 404) me = { kind: "error", message: "TLE OS doesn't have the extension's side yet." };
    else me = { kind: "signedOut" };
    draw();
  }

  async function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    draft = "";
    chat.messages.push({ role: "me", text });
    busy = true;
    clearPoint();
    draw();
    save();
    const r = await send({
      type: "ask",
      body: {
        text,
        thread: chat.thread,
        separate: true,
        site: "propoly",
        propolyDeal: current || "",
        path: ("propoly:" + location.pathname).slice(0, 200),
        screen: snapshot(),
      },
    });
    busy = false;
    const b = (r && r.body) || {};
    if (!r || r.status === 0) chat.messages.push({ role: "steve", text: "I couldn't reach TLE OS just then. Check your connection and ask me again." });
    else if (r.status === 401) { me = { kind: "signedOut" }; chat.messages.push({ role: "steve", text: "You're signed out of TLE OS. Sign in and ask me again." }); }
    else if (!b.reply) chat.messages.push({ role: "steve", text: b.error || "Something went wrong reaching me just then. Try again in a minute." });
    else {
      const steps = b.screen && Array.isArray(b.screen.steps) ? b.screen.steps.filter((s) => refs.has(s.ref)).map((s) => ({ ref: s.ref, label: labelOf(refs.get(s.ref)), do: s.do, value: s.value, says: s.says })) : [];
      const open = b.open && typeof b.open.href === "string" && b.open.href.startsWith("/") ? { href: b.open.href, label: "Open in TLE OS" } : null;
      chat.messages.push({ role: "steve", text: b.reply, steps, open });
      /* He has pointed: start showing straight away. */
      if (steps.length) startPoint(steps);
    }
    draw();
    save();
  }

  /* ---------------------------------------------------------------- pointing */
  let raf = 0;
  function startPoint(steps) {
    pointing = { steps, i: 0 };
    showStep();
  }
  function clearPoint() {
    pointing = null;
    cancelAnimationFrame(raf);
    $point.innerHTML = "";
  }
  function showStep() {
    cancelAnimationFrame(raf);
    if (!pointing) return;
    const s = pointing.steps[pointing.i];
    const el = s && refs.get(s.ref);
    if (!el || !el.isConnected) {
      $point.innerHTML = `<div class="tip" style="right:20px;bottom:90px"><div class="step">Step ${pointing.i + 1} of ${pointing.steps.length}</div>
        <p class="says">That isn't on this screen any more.</p><p class="yours">Ask again from the screen you're on now and I'll find it.</p>
        <div class="row"><button class="btn ghost" data-act="pointDone" type="button">Close</button></div></div>`;
      return;
    }
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const last = pointing.i === pointing.steps.length - 1;
    const hint = s.do === "type" ? "Type it in yourself" : s.do === "choose" ? "Choose it yourself" : s.do === "tick" || s.do === "untick" ? "Tick it yourself" : "Press it yourself";
    $point.innerHTML = `<div class="ring"></div><div class="tip" role="dialog" aria-label="Step ${pointing.i + 1}">
      <div class="step">Step ${pointing.i + 1} of ${pointing.steps.length}</div>
      <p class="says">${IC.point}<span>${esc(s.says)}</span></p><p class="yours">${hint}. I only point in Propoly.</p>
      <div class="row">${last ? `<button class="btn" data-act="pointDone" type="button">Done</button>` : `<button class="btn" data-act="pointNext" type="button">Next</button><button class="btn ghost" data-act="pointDone" type="button">Stop</button>`}</div></div>`;
    const ring = $point.querySelector(".ring");
    const tip = $point.querySelector(".tip");
    const place = () => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      Object.assign(ring.style, { left: r.left - 4 + "px", top: r.top - 4 + "px", width: r.width + 8 + "px", height: r.height + 8 + "px" });
      const tw = tip.offsetWidth, th = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
      let top = r.bottom + 12;
      if (top + th > vh - 12) top = Math.max(12, r.top - th - 12);
      const left = Math.min(Math.max(12, r.left), vw - tw - 12);
      Object.assign(tip.style, { left: left + "px", top: top + "px" });
      raf = requestAnimationFrame(place);
    };
    place();
  }
  function nextStep() {
    if (!pointing) return;
    if (pointing.i < pointing.steps.length - 1) { pointing.i++; showStep(); }
    else clearPoint();
  }
  /* They pressed the highlighted control themselves: move on to the next. */
  document.addEventListener(
    "click",
    (e) => {
      if (!pointing) return;
      const s = pointing.steps[pointing.i];
      const el = s && refs.get(s.ref);
      if (el && e.target instanceof Node && el.contains(e.target) && s.do !== "type") setTimeout(nextStep, 250);
    },
    true
  );

  /* ---------------------------------------------------------------- presses inside Steve */
  shadow.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-act]");
    if (!el) return;
    const act = el.getAttribute("data-act");
    if (act === "toggle" || act === "open") {
      chat.open = act === "open" ? true : !chat.open;
      chat.justOpened = chat.open;
      if (chat.open && me.kind !== "ok") whoAmI();
      draw();
      save();
    } else if (act === "close") {
      chat.open = false;
      draw();
      save();
    } else if (act === "send") {
      const ta = shadow.querySelector("textarea");
      ask(ta ? ta.value : draft);
    } else if (act === "starter") ask(el.textContent);
    else if (act === "os") send({ type: "open", path: el.getAttribute("data-href") });
    else if (act === "signIn") send({ type: "open", path: "/sign-in" });
    else if (act === "recheck") { whoAmI(); lookupDeal(); }
    else if (act === "point") {
      const m = chat.messages[Number(el.getAttribute("data-i"))];
      if (m && m.steps && m.steps.length) {
        /* Found again by their words on the screen as it is now: the refs
           belonged to the screen he was shown when he answered. */
        snapshot();
        const byLabel = new Map([...refs].map(([ref, node]) => [labelOf(node), ref]));
        startPoint(m.steps.map((s) => ({ ...s, ref: byLabel.get(s.label) || "gone" })));
      }
    } else if (act === "pointNext") nextStep();
    else if (act === "pointDone") clearPoint();
  });
  shadow.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (pointing) clearPoint();
      else if (chat.open) { chat.open = false; draw(); save(); shadow.querySelector(".orbbtn")?.focus(); }
    }
  });

  /* ---------------------------------------------------------------- start */
  (async () => {
    const r = await send({ type: "state:get" });
    if (r && r.state) {
      chat.open = Boolean(r.state.open);
      if (r.state.thread) chat.thread = r.state.thread;
      if (Array.isArray(r.state.messages)) chat.messages = r.state.messages;
    }
    draw();
    whoAmI();
    if (current) lookupDeal();
  })();

  /* Propoly can move between pages without a full load, so watch the address. */
  setInterval(() => {
    const id = dealId();
    if (id === current) return;
    current = id;
    clearPoint();
    lookupDeal();
  }, 800);

  /* Back from signing in, or from the let: check again, quietly. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (me.kind !== "ok") whoAmI();
    if (current && deal.kind !== "loading" && deal.kind !== "yours") lookupDeal();
  });
})();
