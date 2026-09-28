"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Segmented from "@/components/Segmented";
import DoodleIcon from "@/components/DoodleIcon";
import { AGENT_GUIDES } from "@/lib/agent-guides";
import { openGuide } from "@/lib/guide-sheet";
import { SAMPLE_WHO, SIDES, STEPS_FOR, type ShowroomScreen, type ShowroomSide, type ShowroomStep } from "@/lib/showroom/content";

/**
 * The Showroom's screen (lib/showroom/content says what and why).
 *
 * Tabs across the top for whose side of the glass - tenant, landlord, agent -
 * and down the side the steps of that journey, numbered. The step on the right
 * shows the other person's own screen, live and in a phone or a desktop frame,
 * every email they get at that point (open it, or have it sent to you), what
 * the agent does to set it off, what is honestly not built yet, and a box for
 * what is wrong with it. The step is in the address, so a link to one opens it.
 */

type EmailMeta = {
  id: string;
  name: string;
  to: string;
  when: string;
  summary: string;
  status: { key: "live" | "ready" | "built" | "written" | "planned"; says: string };
};

const STATUS_TONE: Record<EmailMeta["status"]["key"], string> = {
  live: "bg-[#e3efe0] text-[#2f5d2a]",
  ready: "bg-[#eef1e6] text-[#4d5a33]",
  built: "bg-panel text-muted",
  written: "bg-panel text-muted",
  planned: "bg-accent-soft text-accent-dark",
};

export default function ShowroomView({ token, phoneOrigin }: { token: string; phoneOrigin: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const side = (SIDES.find((s) => s.id === params.get("side"))?.id ?? "tenant") as ShowroomSide;
  const steps = STEPS_FOR[side];
  const step = steps.find((s) => s.id === params.get("step")) ?? steps[0] ?? null;
  const at = step ? steps.indexOf(step) : -1;

  const go = useCallback(
    (next: { side?: ShowroomSide; step?: string | null }) => {
      const q = new URLSearchParams(params.toString());
      if (next.side) q.set("side", next.side);
      if (next.step === null) q.delete("step");
      else if (next.step) q.set("step", next.step);
      router.replace(`/showroom?${q.toString()}`, { scroll: false });
    },
    [params, router]
  );

  const sideInfo = SIDES.find((s) => s.id === side)!;

  /* On a phone the steps are one row that scrolls sideways: bring the one
     being read into it, without moving the page. */
  const row = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = row.current;
    if (!ol || ol.scrollWidth <= ol.clientWidth) return;
    const on = ol.querySelector<HTMLElement>('[aria-current="step"]');
    if (on) ol.scrollTo({ left: on.offsetLeft - 16, behavior: "smooth" });
  }, [step?.id]);

  return (
    <>
      <PageHeader
        title="Showroom"
        blurb="Every journey from the other side of the glass: what the tenant, the landlord and the agent see at each step, every email that goes out, and a place to say what is not right."
        illustration="/illustrations/lady-window.png"
        illustrationAspect={0.6925}
        hideArtOnPhone
        lineBreak="none"
        actions={
          <Segmented
            options={SIDES.map((s) => ({ id: s.id, label: s.label }))}
            value={side}
            onChange={(v) => go({ side: v, step: null })}
          />
        }
      />

      <p className="mt-6 text-[13px] text-muted">{sideInfo.says}</p>

      {!sideInfo.ready ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line/80 px-6 py-14 text-center">
          <DoodleIcon name="rocket" size={26} className="mx-auto text-muted" />
          <p className="mt-3 text-[15px]">The {sideInfo.label.toLowerCase()} side is next</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-muted">
            The tenant journey is in first. This tab fills in the same way: every step, the screen they see, the emails that go out, and a place for feedback.
          </p>
        </div>
      ) : step ? (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ── The steps ── */}
          <nav aria-label="Steps" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <ol ref={row} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {steps.map((s, i) => {
                const on = s.id === step.id;
                return (
                  <li key={s.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => go({ step: s.id })}
                      aria-current={on ? "step" : undefined}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                        on ? "bg-ink text-page" : "hover:bg-panel"
                      }`}
                    >
                      <span
                        className={`figures flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                          on ? "bg-page text-ink" : "bg-panel text-muted"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="whitespace-nowrap text-[13px] lg:whitespace-normal">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* ── The step ── */}
          <StepView
            key={`${side}-${step.id}`}
            side={side}
            step={step}
            number={at + 1}
            token={token}
            phoneOrigin={phoneOrigin}
            prev={at > 0 ? steps[at - 1] : null}
            next={at < steps.length - 1 ? steps[at + 1] : null}
            onGo={(id) => go({ step: id })}
          />
        </div>
      ) : null}
    </>
  );
}

function StepView({
  side,
  step,
  number,
  token,
  phoneOrigin,
  prev,
  next,
  onGo,
}: {
  side: ShowroomSide;
  step: ShowroomStep;
  number: number;
  token: string;
  phoneOrigin: string | null;
  prev: ShowroomStep | null;
  next: ShowroomStep | null;
  onGo: (id: string) => void;
}) {
  return (
    <article className="min-w-0 space-y-5">
      <section className="rounded-3xl border border-line/70 bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step {number}</p>
        <h2 className="mt-1 text-[24px] leading-tight">{step.title}</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed">{step.lead}</p>
        <ul className="mt-4 space-y-1.5">
          {step.sees.map((line) => (
            <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-dark/70" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      {step.screens.length > 0 && <Screens side={side} screens={step.screens} token={token} phoneOrigin={phoneOrigin} />}
      {step.guide && <GuideShots guideId={step.guide} href={step.agent.href} />}

      <Emails ids={step.emails} showTo={side === "agent"} />

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-line/70 bg-card p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <DoodleIcon name="user" size={13} /> What the agent does
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed">{step.agent.says}</p>
          {step.agent.href && (
            <Link href={step.agent.href} className="mt-3 inline-block text-[12px] font-semibold text-accent-dark underline underline-offset-2">
              Open that screen
            </Link>
          )}
        </div>
        <div className="rounded-3xl border border-line/70 bg-card p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <DoodleIcon name="info" size={13} /> Not built yet
          </p>
          {step.notYet?.length ? (
            <ul className="mt-2 space-y-1.5">
              {step.notYet.map((line) => (
                <li key={line} className="text-[13px] leading-relaxed">{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Nothing missing that we know of at this step.</p>
          )}
        </div>
      </section>

      <Feedback side={side} step={step} />

      <div className="flex items-center justify-between gap-3 pt-1">
        {prev ? (
          <button type="button" onClick={() => onGo(prev.id)} className="text-[12.5px] text-muted transition-colors hover:text-ink">
            ← {prev.title}
          </button>
        ) : <span />}
        {next && (
          <button type="button" onClick={() => onGo(next.id)} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">
            Next: {next.title} →
          </button>
        )}
      </div>
    </article>
  );
}

/* ─────────────────────────── the screens ─────────────────────────── */

const FRAME = { phone: { w: 390, h: 780 }, desktop: { w: 1280, h: 820 } } as const;

/** Where to open a screen: the stage switch first when it has a stage, so the demo shows that moment. */
function srcOf(s: ShowroomScreen, token: string): string {
  const path = s.href.replace("{token}", encodeURIComponent(token));
  return s.stage ? `/tenant/demo/stage?to=${s.stage}&back=${encodeURIComponent(path)}` : path;
}

function Screens({
  side,
  screens,
  token,
  phoneOrigin,
}: {
  side: ShowroomSide;
  screens: ShowroomScreen[];
  token: string;
  phoneOrigin: string | null;
}) {
  const [i, setI] = useState(0);
  const screen = screens[Math.min(i, screens.length - 1)];
  const [device, setDevice] = useState<"phone" | "desktop">(screen.device ?? "desktop");
  useEffect(() => setDevice(screen.device ?? "desktop"), [screen]);
  const src = srcOf(screen, token);
  const [scan, setScan] = useState(false);

  /* Scaled to fit the column: the page inside is drawn at its real size. */
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const f = FRAME[device];
  const room = device === "phone" ? Math.min(width, 360) : width;
  const scale = room > 0 ? Math.min(1, room / f.w) : 0.5;

  return (
    <section className="rounded-3xl border border-line/70 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <DoodleIcon name="home" size={13} /> What they see
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={[{ id: "desktop" as const, label: "Computer" }, { id: "phone" as const, label: "Phone" }]}
            value={device}
            onChange={setDevice}
          />
          <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
            Open it full size
          </a>
          <button
            type="button"
            onClick={() => setScan((v) => !v)}
            aria-expanded={scan}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
              scan ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:text-ink"
            }`}
          >
            <DoodleIcon name="camera" size={13} /> On your phone
          </button>
        </div>
      </div>
      {scan && <PhoneCode path={src} origin={phoneOrigin} label={screen.label} />}
      {screens.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {screens.map((s, n) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setI(n)}
              className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${n === i ? "bg-ink text-page" : "bg-panel text-muted hover:text-ink"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="mt-4 flex justify-center overflow-hidden">
        <div
          className={`relative overflow-hidden border border-line/80 bg-page shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] ${device === "phone" ? "rounded-[28px]" : "rounded-xl"}`}
          style={{ width: f.w * scale, height: f.h * scale }}
        >
          <iframe
            key={src + device}
            src={src}
            title={`${screen.label}, as the ${side} sees it`}
            style={{ width: f.w, height: f.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            className="absolute left-0 top-0 border-0"
          />
        </div>
      </div>
      <p className="mt-3 text-center text-[11.5px] text-muted">
        {SAMPLE_WHO[side]}. Click around - nothing here is real and nothing is saved.
      </p>
    </section>
  );
}

/**
 * The same screen on a real phone: a code to scan with the camera. Every
 * screen here is a public demo page (the passport preview, Sophie's area,
 * Raj's portal, the decks), so the phone opens it with nothing to sign in to.
 * The code follows the screen picked above it, stage and all.
 */
function PhoneCode({ path, origin, label }: { path: string; origin: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    const full = new URL(path, origin ?? window.location.origin).toString();
    setUrl(full);
    let live = true;
    QRCode.toDataURL(full, { errorCorrectionLevel: "M", margin: 0, scale: 8, color: { dark: "#101014", light: "#ffffff" } })
      .then((d) => live && setPng(d))
      .catch(() => live && setPng(null));
    return () => {
      live = false;
    };
  }, [path, origin]);
  const local = url ? /^http:\/\/(10|172|192)\./.test(url) : false;

  return (
    <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl bg-panel p-4 sm:flex-row sm:items-center">
      <div className="flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-xl bg-white p-2.5">
        {png ? <img src={png} alt={`A code that opens ${label} on a phone`} className="h-full w-full" /> : <span aria-label="Making the code" className="block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />}
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <p className="text-[13.5px]">Scan it with your phone&apos;s camera</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Opens {label.toLowerCase()} on the phone itself, at this same step. Nothing to sign in to.
          {local && " Your phone needs to be on the same wifi as this computer."}
        </p>
        {url && <p className="mt-2 break-all text-[11px] text-muted/80">{url}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────── the agent's screens ─────────────────────── */

/**
 * An agent's screens are their own live OS, so rather than frame a real
 * record the step shows the screenshots its pop-up guide was written round
 * (lib/agent-guides), one at a time with the guide's own words, and a button
 * that opens the whole guide over the page.
 */
function GuideShots({ guideId, href }: { guideId: string; href?: string }) {
  const guide = AGENT_GUIDES.find((g) => g.id === guideId);
  const shots = (guide?.steps ?? []).filter((s) => s.image);
  const [i, setI] = useState(0);
  if (!guide || !shots.length) return null;
  const shot = shots[Math.min(i, shots.length - 1)];
  return (
    <section className="rounded-3xl border border-line/70 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <DoodleIcon name="home" size={13} /> What you see
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openGuide(guide.id)} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page">
            Walk me through it
          </button>
          {href && (
            <Link href={href} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
              Open the real screen
            </Link>
          )}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line/80 bg-page">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.image} alt={shot.title} className="block w-full" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px]">{shot.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{shot.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} aria-label="Previous screen" className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted disabled:opacity-40">‹</button>
          <span className="figures text-[11.5px] text-muted">{i + 1} / {shots.length}</span>
          <button type="button" onClick={() => setI((n) => Math.min(shots.length - 1, n + 1))} disabled={i >= shots.length - 1} aria-label="Next screen" className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted disabled:opacity-40">›</button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── the emails ─────────────────────────── */

function Emails({ ids, showTo = false }: { ids: string[]; showTo?: boolean }) {
  const [rows, setRows] = useState<EmailMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<EmailMeta | null>(null);

  useEffect(() => {
    if (!ids.length) return;
    let live = true;
    fetch(`/api/showroom/email?ids=${ids.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok) setRows(j.emails as EmailMeta[]);
        else setError(j?.error ?? "The emails did not load.");
      })
      .catch(() => live && setError("The emails did not load."));
    return () => { live = false; };
  }, [ids]);

  return (
    <section className="rounded-3xl border border-line/70 bg-card p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <DoodleIcon name="mail" size={13} /> {showTo ? "The emails at this step" : "The emails they get"}
      </p>
      {!ids.length ? (
        <p className="mt-2 text-[13px] text-muted">No email goes out at this step.</p>
      ) : error ? (
        <p className="mt-2 text-[13px] text-accent-dark">{error}</p>
      ) : !rows ? (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading the emails…
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line/60">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px]">
                  {e.name}
                  {showTo && <span className="ml-2 rounded-full bg-panel px-2 py-0.5 align-middle text-[10.5px] font-semibold text-muted">{e.to}</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">{e.when}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed">{e.summary}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_TONE[e.status.key]}`}>{e.status.says}</span>
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page"
                >
                  Open the email
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <EmailSheet meta={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function EmailSheet({ meta, onClose }: { meta: EmailMeta; onClose: () => void }) {
  const [state, setState] = useState<{ subject: string; html: string } | { error: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/showroom/email?id=${encodeURIComponent(meta.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setState(j?.ok ? { subject: j.subject, html: j.html } : { error: j?.error ?? "That email did not load." }))
      .catch(() => live && setState({ error: "That email did not load." }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { live = false; window.removeEventListener("keydown", onKey); };
  }, [meta.id, onClose]);

  async function sendToMe() {
    setSending(true);
    setSent(null);
    try {
      const r = await fetch("/api/showroom/send-me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: meta.id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; to?: string; error?: string };
      setSent(j.ok ? { ok: true, text: `Sent to ${j.to}. It is marked [Showroom].` } : { ok: false, text: j.error ?? "That did not send." });
    } catch {
      setSent({ ok: false, text: "That did not send. Try again in a moment." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div role="dialog" aria-label={meta.name} className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{meta.when}</p>
            <p className="mt-1 truncate text-[15px]">{"subject" in (state ?? {}) ? (state as { subject: string }).subject : meta.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-panel/50">
          {!state ? (
            <p className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Drawing the email…
            </p>
          ) : "error" in state ? (
            <p className="py-16 text-center text-[13px] text-accent-dark">{state.error}</p>
          ) : (
            /* Email markup is tables and inline styles; a sandboxed frame keeps it
               from fighting this page, and nothing in it can run (as /admin/emails). */
            <iframe title={meta.name} sandbox="" srcDoc={state.html} className="h-[62vh] w-full border-0 bg-white" />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line/70 px-6 py-3.5">
          <p className={`text-[12px] ${sent ? (sent.ok ? "text-[#2f5d2a]" : "text-accent-dark") : "text-muted"}`}>
            {sent ? sent.text : "Filled in with sample details, as it goes out."}
          </p>
          <button
            type="button"
            onClick={sendToMe}
            disabled={sending || !state || "error" in state}
            className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50"
          >
            {sending ? "Sending…" : "Email it to me"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── feedback ─────────────────────────── */

function Feedback({ side, step }: { side: ShowroomSide; step: ShowroomStep }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setDone(null);
    try {
      const r = await fetch("/api/bugs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: `Showroom, ${side}: ${step.title}\n\n${text.trim()}`,
          path: `/showroom?side=${side}&step=${step.id}`,
          kind: "idea",
          context: { showroom: side, step: step.id },
        }),
      });
      if (!r.ok) throw new Error();
      setText("");
      setDone({ ok: true, text: "Thank you - that is on the list." });
    } catch {
      setDone({ ok: false, text: "That did not send. Try again in a moment - what you typed is still here." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line/70 bg-card p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <DoodleIcon name="message" size={13} /> Something not right here?
      </p>
      <p className="mt-1 text-[12.5px] text-muted">A word that is wrong, a step that is missing, something a {side} would trip over. It goes straight onto the list with this step attached.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={`What would you change about "${step.title}"?`}
        className="mt-3 w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-[12px] ${done ? (done.ok ? "text-[#2f5d2a]" : "text-accent-dark") : "text-muted"}`}>{done?.text ?? ""}</p>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || busy}
          className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send it"}
        </button>
      </div>
    </section>
  );
}
