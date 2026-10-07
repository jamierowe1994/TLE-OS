"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { ACTORS, BACK_OFFICE, type BackOfficeJourney, type DemoScene } from "@/lib/showroom/back-office";
import { CAST, GAS_JOB, HOME_ID, MAIN_JOB, VISIT_ID, momentIndex, type WayId } from "@/lib/showroom/demo-world";
import { EmailSheet, Emails, Feedback, PhoneCode, type EmailMeta } from "@/components/showroom/ShowroomView";

/**
 * The Showroom's Back office tab (lib/showroom/back-office says what and why).
 *
 * Down the side, the four walkthroughs. On the right, the one picked:
 *
 *  - the LIVE DEMO: one scene at a time, each one a person on their own real
 *    screen at that moment of the story, with what is happening beside it.
 *    The screen can be clicked - it runs on the invented world and saves
 *    nothing (components/showroom/demo/DemoNet) - and the control to press is
 *    ringed. Press it and the scene says so; Play walks the whole story on
 *    its own.
 *  - the GUIDE: the same scenes as an article, each with Show me.
 *  - every email the walkthrough sends, what the agent does, what is not
 *    built yet, and the feedback box.
 *
 * The walkthrough, the way in and the scene are all in the address, so a link
 * to "the gas safety, scene 9" opens exactly that.
 */

type Did = { did: string; sent: string[] };

const PLAY_MS = 9000;

/** Until when the guide's Show me is scrolling the page on purpose (the player's scroll guard stands aside). */
let guideScrollUntil = 0;

export default function BackOfficeView({ token, phoneOrigin, stepId, wayId, sceneNo, go }: {
  token: string;
  phoneOrigin: string | null;
  stepId: string | null;
  wayId: string | null;
  sceneNo: number;
  go: (next: Record<string, string | null>) => void;
}) {
  const journey = BACK_OFFICE.find((j) => j.id === stepId) ?? BACK_OFFICE[0];
  const at = BACK_OFFICE.indexOf(journey);
  const way = (journey.ways?.find((w) => w.id === wayId)?.id ?? journey.ways?.[0]?.id ?? "portal") as WayId;
  const scenes = useMemo(() => journey.scenes(way), [journey, way]);

  const row = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = row.current;
    if (!ol || ol.scrollWidth <= ol.clientWidth) return;
    const on = ol.querySelector<HTMLElement>('[aria-current="step"]');
    if (on) ol.scrollTo({ left: on.offsetLeft - 16, behavior: "smooth" });
  }, [journey.id]);

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Walkthroughs" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <ol ref={row} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {BACK_OFFICE.map((j, i) => {
            const on = j.id === journey.id;
            return (
              <li key={j.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => go({ step: j.id, way: null, scene: null })}
                  aria-current={on ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${on ? "bg-ink text-page" : "hover:bg-panel"}`}
                >
                  <span className={`figures flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${on ? "bg-page text-ink" : "bg-panel text-muted"}`}>{i + 1}</span>
                  <span className="whitespace-nowrap text-[13px] lg:whitespace-normal">{j.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 hidden px-3 text-[11.5px] leading-relaxed text-muted lg:block">
          Every screen here is the real one, running on a sample home. Press anything: nothing is saved and nobody is emailed.
        </p>
      </nav>

      <JourneyView
        key={`${journey.id}-${way}`}
        journey={journey}
        number={at + 1}
        way={way}
        scenes={scenes}
        sceneNo={Math.min(Math.max(sceneNo, 0), scenes.length - 1)}
        token={token}
        phoneOrigin={phoneOrigin}
        go={go}
        next={BACK_OFFICE[at + 1] ?? null}
      />
    </div>
  );
}

function JourneyView({ journey, number, way, scenes, sceneNo, token, phoneOrigin, go, next }: {
  journey: BackOfficeJourney;
  number: number;
  way: WayId;
  scenes: DemoScene[];
  sceneNo: number;
  token: string;
  phoneOrigin: string | null;
  go: (next: Record<string, string | null>) => void;
  next: BackOfficeJourney | null;
}) {
  const player = useRef<HTMLDivElement>(null);
  const allEmails = useMemo(() => Array.from(new Set(scenes.flatMap((s) => [...(s.sends ?? []), ...(s.screen.email ? [s.screen.email] : [])]))), [scenes]);
  const showScene = useCallback((n: number, scroll = false) => {
    go({ scene: String(n) });
    if (scroll) {
      guideScrollUntil = Date.now() + 1500;
      player.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [go]);

  return (
    <article className="min-w-0 space-y-5">
      <section className="rounded-3xl border border-line/70 bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Walkthrough {number}</p>
        <h2 className="mt-1 text-[24px] leading-tight">{journey.title}</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed">{journey.lead}</p>
        <ul className="mt-4 space-y-1.5">
          {journey.sees.map((line) => (
            <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-dark/70" />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Who you will see</span>
          {journey.who.map((a) => (
            <span key={a} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${ACTORS[a].tone}`}>
              <DoodleIcon name={ACTORS[a].icon} size={12} /> {ACTORS[a].label}
            </span>
          ))}
        </div>
      </section>

      {journey.ways && (
        <section className="rounded-3xl border border-line/70 bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">How does it reach us?</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {journey.ways.map((w) => {
              const on = w.id === way;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => go({ way: w.id, scene: null })}
                  aria-pressed={on}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"}`}
                >
                  <span className="block text-[13.5px] font-semibold">{w.label}</span>
                  <span className={`mt-0.5 block text-[12px] leading-snug ${on ? "text-page/75" : "text-muted"}`}>{w.says}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div ref={player} className="scroll-mt-6">
        <Player journey={journey} way={way} scenes={scenes} at={sceneNo} token={token} phoneOrigin={phoneOrigin} onScene={(n) => showScene(n)} />
      </div>

      <Guide journey={journey} scenes={scenes} current={sceneNo} onShow={(n) => showScene(n, true)} />

      <Emails ids={allEmails} showTo />

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-line/70 bg-card p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <DoodleIcon name="user" size={13} /> Where it lives
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed">{journey.agent.says}</p>
          <Link href={journey.agent.href} className="mt-3 inline-block text-[12px] font-semibold text-accent-dark underline underline-offset-2">
            Open the real screen
          </Link>
        </div>
        <div className="rounded-3xl border border-line/70 bg-card p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <DoodleIcon name="info" size={13} /> Not built yet
          </p>
          <ul className="mt-2 space-y-1.5">
            {journey.notYet.map((line) => <li key={line} className="text-[13px] leading-relaxed">{line}</li>)}
          </ul>
        </div>
      </section>

      <Feedback side="backoffice" step={{ id: journey.id, title: journey.title }} />

      {next && (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={() => go({ step: next.id, way: null, scene: null })} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">
            Next: {next.title} →
          </button>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────── the live demo ─────────────────────────── */

const FRAME = { phone: { w: 390, h: 780 }, desktop: { w: 1200, h: 780 } } as const;

function deviceOf(s: DemoScene): "phone" | "desktop" {
  return ["tenant-repairs", "contractor", "repair", "visit", "tenant-documents", "email"].includes(s.screen.kind) ? "phone" : "desktop";
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The scene's screen: a real page on the invented world at the scene's moment. Null for an email. */
export function srcFor(s: DemoScene, j: BackOfficeJourney, way: WayId, token: string): string | null {
  const q = new URLSearchParams({ story: j.story, at: String(momentIndex(j.story, s.screen.at)), way });
  const pre = `/preview/${encodeURIComponent(token)}/back-office`;
  switch (s.screen.kind) {
    case "office-maintenance":
      if (s.screen.open) q.set("open", j.story === "gas" ? GAS_JOB : MAIN_JOB);
      if (s.screen.section) q.set("section", s.screen.section);
      if (s.screen.raise) {
        q.set("raise", s.screen.raise);
        q.set("property", CAST.property);
        q.set("category", j.story === "gas" ? "Gas safety (CP12)" : "Heating & boiler");
        if (j.story === "gas") q.set("due", day(Date.now() + 24 * 86_400_000));
      }
      return `${pre}/maintenance?${q}`;
    case "contractor": return `${pre}/contractor?${q}`;
    case "repair": return `${pre}/repair?${q}`;
    case "visit": return `${pre}/visit?${q}`;
    case "office-compliance":
      if (s.screen.open) q.set("open", HOME_ID);
      return `${pre}/compliance?${q}`;
    case "office-verify": return `${pre}/verify?${q}`;
    case "office-inspections":
      if (s.screen.open) q.set("open", VISIT_ID);
      return `${pre}/inspections?${q}`;
    case "tenant-repairs": q.set("stage", "living"); return `/tenant/demo/maintenance?${q}`;
    case "landlord-repairs": q.set("stage", "managed"); return `/landlord/demo/maintenance?${q}`;
    case "landlord-documents": q.set("stage", "managed"); return `/landlord/demo/documents?${q}`;
    case "tenant-documents": return `/tenant/demo/documents?stage=living`;
    case "email": return null;
  }
}

function Player({ journey, way, scenes, at, token, phoneOrigin, onScene }: {
  journey: BackOfficeJourney;
  way: WayId;
  scenes: DemoScene[];
  at: number;
  token: string;
  phoneOrigin: string | null;
  onScene: (n: number) => void;
}) {
  const scene = scenes[at];
  const actor = ACTORS[scene.actor];
  const src = srcFor(scene, journey, way, token);
  /* On a phone every screen opens as it looks on a phone: a computer screen
     shrunk into 340px is a picture of a screen, and the OS's own pages work
     at phone width. */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [device, setDevice] = useState<"phone" | "desktop">(deviceOf(scene));
  useEffect(() => setDevice(narrow ? "phone" : deviceOf(scene)), [scene, narrow]);
  const [done, setDone] = useState<Record<string, Did>>({});
  const [ring, setRing] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [scan, setScan] = useState(false);
  const [mail, setMail] = useState<EmailMeta | null>(null);
  /* Full screen: the same player over the whole window, for showing it to a room. */
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [big]);
  const frame = useRef<HTMLIFrameElement>(null);
  const did = done[scene.id];

  /* The frame tells us what was pressed (DemoNet). The scene is done when it
     was the press the scene asked for. */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "tle-demo") return;
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data.type === "ready") sendHint();
      if (e.data.type === "touched") setPlaying(false);
      if (e.data.type === "did" && scene.try?.did.includes(e.data.did)) {
        setDone((d) => ({ ...d, [scene.id]: { did: e.data.did, sent: e.data.sent ?? [] } }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, ring]);

  const sendHint = useCallback(() => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.postMessage({ source: "tle-showroom", type: "hint", hint: ring && scene.try && !done[scene.id] ? { text: scene.try.hint, near: scene.try.near } : null }, window.location.origin);
  }, [ring, scene, done]);
  useEffect(sendHint, [sendHint]);

  /* Play: a scene every nine seconds. A press inside the screen pauses it -
     you are driving (DemoNet says "touched"). */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const gone = Date.now() - started;
      setTick(Math.min(1, gone / PLAY_MS));
      if (gone >= PLAY_MS) {
        window.clearInterval(id);
        if (at < scenes.length - 1) onScene(at + 1);
        else setPlaying(false);
      }
    }, 100);
    return () => { window.clearInterval(id); setTick(0); };
  }, [playing, at, scenes.length, onScene]);

  /* Arrow keys step through, unless somebody is typing. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" && at < scenes.length - 1) onScene(at + 1);
      if (e.key === "ArrowLeft" && at > 0) onScene(at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, scenes.length, onScene]);

  /* The emails for the chips: names and who they go to, from the Showroom's own route. */
  const [metas, setMetas] = useState<Record<string, EmailMeta>>({});
  const wanted = useMemo(() => Array.from(new Set(scenes.flatMap((s) => [...(s.sends ?? []), ...(s.screen.email ? [s.screen.email] : [])]))), [scenes]);
  useEffect(() => {
    if (!wanted.length) return;
    let live = true;
    fetch(`/api/showroom/email?ids=${wanted.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setMetas(Object.fromEntries((j.emails as EmailMeta[]).map((m) => [m.id, m]))); })
      .catch(() => {});
    return () => { live = false; };
  }, [wanted]);

  /* Scaled to fit: the page inside is drawn at its real size. */
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [big]);
  const f = FRAME[device];
  const room = device === "phone" ? Math.min(width, big ? 400 : 340) : width;
  const scale = room > 0 ? Math.min(1, room / f.w) : 0.45;

  /* A screen loading in the frame must not move this page (native autofocus
     in the frame's HTML scrolls its parents before any script there runs).
     For two seconds after a scene opens, a scroll nobody asked for is put
     back - unless it is the guide's own Show me, or the person scrolling. */
  useEffect(() => {
    const y0 = window.scrollY;
    const until = Date.now() + 2000;
    let user = false;
    const mark = () => { user = true; };
    const onScroll = () => {
      if (user || Date.now() > until || Date.now() < guideScrollUntil) return;
      if (Math.abs(window.scrollY - y0) > 2) window.scrollTo(0, y0);
    };
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchstart", mark, { passive: true });
    window.addEventListener("keydown", mark);
    window.addEventListener("mousedown", mark);
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(() => window.removeEventListener("scroll", onScroll), 2100);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("mousedown", mark);
      window.removeEventListener("scroll", onScroll);
    };
  }, [src, device]);

  const sent = did?.sent?.length ? did.sent : null;

  return (
    <section className={big ? "fixed inset-0 z-[195] flex flex-col overflow-y-auto bg-card" : "overflow-hidden rounded-3xl border border-line/70 bg-card"}>
      {/* ── the bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e9a39a] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-dark" />
          </span>
          Live demo · scene {at + 1} of {scenes.length}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setPlaying((p) => !p)} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${playing ? "bg-accent-soft text-accent-dark" : "bg-ink text-page"}`}>
            {playing ? "Pause" : at === scenes.length - 1 ? "Play from here" : "Play it through"}
          </button>
          <button type="button" onClick={() => { setDone({}); setPlaying(false); onScene(0); }} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
            Start again
          </button>
          <button
            type="button"
            onClick={() => setRing((r) => !r)}
            aria-pressed={ring}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${ring ? "border-ink text-ink" : "border-line/80 text-muted hover:text-ink"}`}
            title="Ring the button to press on each screen"
          >
            {ring ? "Showing where to press" : "Show where to press"}
          </button>
          <button type="button" onClick={() => setBig((b) => !b)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
            {big ? "Close full screen" : "Full screen"}
          </button>
        </div>
      </div>
      {playing && <div className="h-0.5 bg-panel"><div className="h-full bg-accent-dark transition-[width] duration-100" style={{ width: `${tick * 100}%` }} /></div>}

      {/* ── the scenes, as a strip ── */}
      <ol className="flex gap-1.5 overflow-x-auto border-b border-line/60 px-5 py-3" aria-label="Scenes">
        {scenes.map((s, n) => {
          const on = n === at;
          const a = ACTORS[s.actor];
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => { setPlaying(false); onScene(n); }}
                aria-current={on ? "step" : undefined}
                title={`${n + 1}. ${s.title}`}
                className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11.5px] transition-colors ${on ? "bg-ink text-page" : done[s.id] ? "bg-[#eef1e6] text-[#4d5a33]" : "bg-panel text-muted hover:text-ink"}`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? "bg-page text-ink" : "bg-white/70"}`}>
                  {done[s.id] ? <span className="text-[10px] font-bold">✓</span> : <DoodleIcon name={a.icon} size={11} />}
                </span>
                <span className="figures">{n + 1}</span>
                <span className="hidden max-w-[150px] truncate sm:inline">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* ── the stage ── */}
      {/* Side by side for a phone, and for any screen at full size; a computer
          screen in the page takes the full width, with the words above it. */}
      <div className={`grid grid-cols-[minmax(0,1fr)] gap-6 p-5 ${big ? "flex-1 lg:grid-cols-[minmax(0,1fr)_380px]" : device === "phone" ? "xl:grid-cols-[360px_minmax(0,1fr)]" : ""}`}>
        <div className={`min-w-0 ${big ? "" : device === "desktop" ? "order-2" : "order-2 xl:order-1"}`}>
          <div ref={box} className="flex justify-center overflow-hidden">
            {src ? (
              <div
                className={`relative overflow-hidden border border-line/80 bg-page shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] ${device === "phone" ? "rounded-[28px]" : "rounded-xl"}`}
                style={{ width: f.w * scale, height: f.h * scale }}
              >
                <iframe
                  ref={frame}
                  key={src + device}
                  src={src}
                  title={`${scene.title}, as ${actor.who} sees it`}
                  style={{ width: f.w, height: f.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                  className="absolute left-0 top-0 border-0"
                />
              </div>
            ) : (
              <Inbox id={scene.screen.email!} to={scene.actor} meta={metas[scene.screen.email!]} width={Math.min(width, 380)} />
            )}
          </div>
          {src && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <div className="flex rounded-full bg-panel p-0.5 text-[11.5px]">
                {(["desktop", "phone"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 ${device === d ? "bg-ink text-page" : "text-muted"}`}>{d === "desktop" ? "Computer" : "Phone"}</button>
                ))}
              </div>
              <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] text-muted hover:text-ink">Open it full size</a>
              <button type="button" onClick={() => setScan((v) => !v)} aria-expanded={scan} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] ${scan ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:text-ink"}`}>
                <DoodleIcon name="camera" size={12} /> On your phone
              </button>
            </div>
          )}
          {scan && src && <PhoneCode path={src} origin={phoneOrigin} label={scene.title} />}
        </div>

        {/* ── what is happening ── */}
        <div className={`min-w-0 ${big ? "" : device === "desktop" ? "order-1 grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0" : "order-1 xl:order-2"}`}>
          <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${actor.tone}`}>
            <DoodleIcon name={actor.icon} size={12} /> {actor.label} · {actor.who}
          </span>
          <h3 className="mt-3 text-[21px] leading-tight">{scene.title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed">{scene.says}</p>
          {scene.where && (
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
              <DoodleIcon name="search" size={12} /> {scene.where}
            </p>
          )}
          </div>
          <div>

          {scene.try && (
            <div className={`mt-4 rounded-2xl p-4 ${did ? "bg-[#eef1e6]" : "bg-accent-soft/60"}`}>
              {did ? (
                <>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-[#4d5a33]">Done</p>
                  <p className="mt-1 text-[13px] leading-relaxed">That is the press. {sent ? "In real life it would have sent:" : "Nothing is emailed at this step."}</p>
                  {sent && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {sent.map((id) => (
                        <li key={id}>
                          <button type="button" onClick={() => metas[id] && setMail(metas[id])} className="rounded-full bg-white px-2.5 py-1 text-[11.5px] hover:underline">
                            {metas[id]?.name ?? id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-accent-dark">Try it</p>
                  <p className="mt-1 text-[13px] leading-relaxed">{scene.try.says}</p>
                  <p className="mt-1.5 text-[11.5px] text-muted">{ring ? "The button is ringed on the screen." : "Turn on Show where to press to ring it."}</p>
                </>
              )}
            </div>
          )}

          {scene.sends && scene.sends.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">What goes out</p>
              <ul className="mt-2 space-y-1.5">
                {scene.sends.map((id) => {
                  const m = metas[id];
                  return (
                    <li key={id}>
                      <button type="button" onClick={() => m && setMail(m)} disabled={!m} className="flex w-full items-start gap-2.5 rounded-xl border border-line/70 px-3 py-2 text-left transition-colors hover:border-ink/40 disabled:opacity-60">
                        <DoodleIcon name="mail" size={14} className="mt-0.5 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px]">{m?.name ?? "…"}</span>
                          <span className="block text-[11.5px] text-muted">{m ? m.to : ""}{m?.status.key !== "live" && m ? ` · ${m.status.says}` : ""}</span>
                        </span>
                        <span className="text-[11.5px] font-semibold text-accent-dark">Open</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" disabled={at === 0} onClick={() => { setPlaying(false); onScene(at - 1); }} className="text-[12.5px] text-muted transition-colors hover:text-ink disabled:opacity-40">
              ← Back
            </button>
            {at < scenes.length - 1 ? (
              <button type="button" onClick={() => { setPlaying(false); onScene(at + 1); }} className={`rounded-full px-4 py-2 text-[12.5px] font-semibold ${did ? "bg-accent-dark text-white" : "bg-ink text-page"}`}>
                Next: {scenes[at + 1].title} →
              </button>
            ) : (
              <span className="text-[12.5px] text-muted">That is the whole walkthrough.</span>
            )}
          </div>
          </div>
        </div>
      </div>
      {mail && <EmailSheet meta={mail} onClose={() => setMail(null)} />}
    </section>
  );
}

/** An email scene: the email as it lands, in a phone's inbox. */
function Inbox({ id, to, meta, width }: { id: string; to: DemoScene["actor"]; meta: EmailMeta | undefined; width: number }) {
  const [state, setState] = useState<{ subject: string; html: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    fetch(`/api/showroom/email?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setState(j?.ok ? { subject: j.subject, html: j.html } : { error: j?.error ?? "That email did not load." }))
      .catch(() => live && setState({ error: "That email did not load." }));
    return () => { live = false; };
  }, [id]);
  const who = to === "tenant" ? CAST.tenant.name : to === "landlord" ? CAST.landlord.name : to === "contractor" ? "Dan Mercer" : to === "compliance" ? "Compliance" : CAST.agent.name;
  const w = Math.max(280, width || 340);
  return (
    <div className="overflow-hidden rounded-[28px] border border-line/80 bg-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]" style={{ width: w }}>
      <div className="border-b border-line/60 bg-panel/60 px-4 py-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Inbox · {who}</p>
        <p className="mt-1 truncate text-[13.5px] font-semibold text-ink">{state && "subject" in state ? state.subject : meta?.name ?? "…"}</p>
        <p className="text-[11.5px] text-muted">From The Letting Experts{meta ? ` · ${meta.when}` : ""}</p>
      </div>
      {!state ? (
        <p className="flex items-center justify-center gap-2 py-24 text-[12.5px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" /> Drawing the email…
        </p>
      ) : "error" in state ? (
        <p className="px-4 py-20 text-center text-[13px] text-accent-dark">{state.error}</p>
      ) : (
        <iframe title={meta?.name ?? "The email"} sandbox="" srcDoc={state.html} className="block w-full border-0" style={{ height: 600 }} />
      )}
    </div>
  );
}

/* ─────────────────────────── the guide ─────────────────────────── */

function Guide({ journey, scenes, current, onShow }: { journey: BackOfficeJourney; scenes: DemoScene[]; current: number; onShow: (n: number) => void }) {
  return (
    <section className="rounded-3xl border border-line/70 bg-card p-6">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <DoodleIcon name="doc" size={13} /> Read it as a guide
      </p>
      <h3 className="mt-1 text-[20px] leading-tight">{journey.title}, Step by Step</h3>
      <ol className="mt-5 space-y-5">
        {scenes.map((s, n) => {
          const a = ACTORS[s.actor];
          return (
            <li key={s.id} className={`grid grid-cols-[34px_minmax(0,1fr)] gap-3 ${n === current ? "" : ""}`}>
              <span className={`figures flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ${n === current ? "bg-ink text-page" : "bg-panel text-muted"}`}>{n + 1}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${a.tone}`}>
                    <DoodleIcon name={a.icon} size={10} /> {a.label}
                  </span>
                  <span className="text-[15px]">{s.title}</span>
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.says}</p>
                {(s.where || s.try) && (
                  <p className="mt-1.5 text-[12px] leading-relaxed">
                    {s.where && <span className="text-muted">Where: {s.where}. </span>}
                    {s.try && <span>{s.try.says}</span>}
                  </p>
                )}
                <button type="button" onClick={() => onShow(n)} className="mt-2 text-[12px] font-semibold text-accent-dark underline underline-offset-2">
                  Show me
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
