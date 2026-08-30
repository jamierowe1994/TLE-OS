"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import RexDino from "@/components/RexDino";
import { ACCENTS, ACCENT_KEY, applyAccent } from "@/lib/accents";
import {
  applyDarkPalette,
  applyTheme,
  writeTheme,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * The five screens, and the two that bookend them.
 *
 * Kept in one file because the COPY is the substance here, not the markup,
 * and copy that is meant to read as one voice is easier to keep in one voice
 * when you can see all of it at once. The moment any of these needs real
 * behaviour beyond a form post, it should leave.
 *
 * House rule, applied throughout: no em dashes in anything a person reads.
 */

const PRIMARY =
  "w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40";
const GHOST =
  "w-full rounded-lg border border-line/80 py-2.5 text-[12.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink";
const FIELD =
  "mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[14px] outline-none focus:border-ink";
const LABEL = "text-[10px] uppercase tracking-wider text-muted";

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="hand text-[22px] leading-tight">{children}</h1>;
}

function Blurb({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px] leading-relaxed">
      {children}
    </p>
  );
}

/* ── Welcome ───────────────────────────────────────────────────────────────
   Names them, because we already know: they got here through a link minted
   against their invite. Being greeted by name is the cheapest possible proof
   that this was set up for them and not a form they wandered into. */

export function Welcome({ name, onNext }: { name: string; onNext: () => void }) {
  /* "Hello, Susan." but "Hello there." - the comma belongs to a name and
     reads as a stumble without one. The fallback is only ever seen in the
     preview, where there is no account to have a name on. */
  const first = (name || "").trim().split(/\s+/)[0];
  return (
    <>
      <p className="hand text-[11px] uppercase tracking-[0.2em] text-muted">Welcome</p>
      <h1 className="hand mt-2 text-[27px] leading-tight">
        {first ? `Hello, ${first}.` : "Hello there."}
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed">
        Your password is set, so your account exists. Four more things and the OS
        is yours: your REX, your email, how this pre-launch works, and how you
        want it to look.
      </p>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        One at a time, and it takes about three minutes. Nothing here is
        permanent, so answer quickly and change your mind later.
      </p>
      <button type="button" onClick={onNext} className={`${PRIMARY} mt-6`}>
        Start
      </button>
    </>
  );
}

/* ── REX ───────────────────────────────────────────────────────────────────
   The one step that must not be skipped, so it is the one with a drawing on
   it. Everything the OS shows an agent is their own work read out of REX; an
   account that reaches the dashboard without this sees empty tiles and
   reasonably concludes the product is broken. */

export function StepRex({
  preview,
  onDone,
}: {
  /** Previewing rather than joining: no database, or an owner replaying. */
  preview: boolean;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/rex/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) onDone();
      else setError(j.error ?? "REX would not accept that. Check the address and try again.");
    } catch {
      setError("We could not reach REX just then. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Question first, then why, then the drawing, then the doing.
          The drawing led at first and it made the screen charming before it
          made it clear - you met a dinosaur and had to work out what it
          wanted. Title, subtext, illustration, form (James, 30 Aug). */}
      <Title>Connect Your REX</Title>
      <Blurb>
        Everything the OS shows you is your own work, read live out of REX. Until
        this is connected there is nothing for it to show you.
      </Blurb>

      <div className="my-7 flex justify-center text-ink">
        <RexDino size={230} />
      </div>

      {error && <Problem>{error}</Problem>}

      <form onSubmit={submit} className="mt-5">
        <label htmlFor="rex-email" className={LABEL}>
          Your REX email
        </label>
        <input
          id="rex-email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />

        <label htmlFor="rex-password" className={`${LABEL} mt-4 block`}>
          Your REX password
        </label>
        <input
          id="rex-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />

        <button type="submit" disabled={busy || !email || !password} className={`${PRIMARY} mt-5`}>
          {busy ? "Asking REX…" : "Connect"}
        </button>
      </form>

      {/* Said on the screen and not only in the code. Somebody typing another
          system's password into ours deserves to be told where it goes. */}
      <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
        Your password goes straight to REX and is never stored here. What we keep
        is the pass REX hands back, encrypted, and it renews itself quietly while
        you work. Nobody at TLE can read either one.
      </p>

      {/* Preview only, and it has to exist or the preview dead-ends here: on a
          dev machine there is no database to keep a REX token in, and an owner
          replaying the flow is already connected and should not have to type
          their password again to see the next screen. */}
      {preview && (
        <button type="button" onClick={onDone} className={`${GHOST} mt-3`}>
          Skip, I am only looking
        </button>
      )}
    </>
  );
}

/* ── Email ─────────────────────────────────────────────────────────────────
   The only skippable step. It needs a working Microsoft 365 sign-in, and a
   new starter on their first morning may simply not have one yet. */

export function StepEmail({
  preview,
  problem,
  onSkip,
}: {
  preview: boolean;
  /** Whatever Microsoft said on the way back, already turned into English. */
  problem: string | null;
  onSkip: () => void;
}) {
  return (
    <>
      <Title>Connect Your Email</Title>
      <Blurb>
        So anything you send from the OS goes from your address, in your name,
        and lands in your own Sent items.
      </Blurb>

      <div className="my-7 flex justify-center">
        <img
          src="/illustrations/notioly/paper-airplane.png"
          alt=""
          aria-hidden
          className="art-figure h-44 w-auto object-contain"
        />
      </div>

      {problem && <Problem>{problem}</Problem>}

      <a
        href={preview ? undefined : "/api/auth/microsoft/start?from=setup"}
        aria-disabled={preview}
        onClick={preview ? (e) => e.preventDefault() : undefined}
        className={`${PRIMARY} mt-5 flex items-center justify-center gap-2 ${
          preview ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <DoodleIcon name="mail" size={15} className="text-white" />
        Connect Microsoft 365
      </a>

      <button type="button" onClick={onSkip} className={`${GHOST} mt-3`}>
        Skip for now
      </button>

      <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
        Skipping is fine. Everything else works without it, and you can connect
        it later from your profile. The only thing you cannot do until you do is
        send email from inside the OS.
      </p>
    </>
  );
}

/* ── How the pre-launch works ──────────────────────────────────────────────
   The one screen we actually want read, which is why it sits after the
   connecting is done and before the decorating starts.

   James: "explain the rules, so don't call it rules". So it is framed as what
   we need FROM them rather than what is expected OF them. */

const POINTS: { icon: string; head: string; body: string }[] = [
  {
    icon: "info",
    head: "This is early, on purpose",
    body: "You are among the first people using it. Some screens are complete, some are half built, and a few are still a shell. Nothing you do here can break anything in REX.",
  },
  {
    icon: "cross",
    head: "If a figure looks wrong, say so",
    body: "A number that disagrees with what you know is the single most useful thing you can report. Do not assume somebody else has already noticed, because usually nobody has.",
  },
  {
    icon: "magic-wand",
    head: "If you think of something better, say that too",
    body: "Half of what ends up in here starts as somebody saying it would be easier if. Ideas are worth as much as faults.",
  },
];

export function StepHow({ onNext }: { onNext: () => void }) {
  return (
    <>
      <Title>How The Pre-launch Works</Title>
      <Blurb>Short, and the only screen here worth reading properly.</Blurb>

      <ul className="mt-5 flex flex-col gap-4">
        {POINTS.map((p) => (
          <li key={p.head} className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <DoodleIcon name={p.icon} size={18} className="text-accent-dark" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{p.head}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 rounded-xl border border-line/80 bg-box p-3.5 text-[12px] leading-relaxed">
        There is a button for all of this, in the bottom right of every screen.
        We will point at it in a minute.
      </p>

      <button type="button" onClick={onNext} className={`${PRIMARY} mt-5`}>
        Got it
      </button>
    </>
  );
}

/* ── Look ──────────────────────────────────────────────────────────────────
   Last, because it is the only step with no wrong answer, and ending on a
   choice that is purely theirs beats ending on a password rule.

   Everything applies the instant it is clicked. A preview swatch that only
   takes effect on Save is a swatch you have to trust; this one you can see. */

export function StepLook({
  accent,
  theme,
  onAccent,
  onTheme,
  onNext,
}: {
  accent: string;
  theme: ThemeChoice;
  onAccent: (id: string) => void;
  onTheme: (t: ThemeChoice, e: React.MouseEvent) => void;
  onNext: () => void;
}) {
  const THEMES: { id: ThemeChoice; label: string; hint: string }[] = [
    { id: "light", label: "Light", hint: "Ink on paper" },
    { id: "dark", label: "Dark", hint: "Warm charcoal" },
    { id: "auto", label: "Auto", hint: "Dark after 7pm" },
  ];

  return (
    <>
      <Title>Make It Yours</Title>
      <Blurb>
        No wrong answers here, and it is all in your profile if you change your
        mind.
      </Blurb>

      <p className={`${LABEL} mt-6 block`}>Accent</p>
      <div className="mt-2 flex gap-2.5">
        {ACCENTS.map((a) => {
          const on = a.id === accent;
          return (
            <button
              key={a.id || "clay"}
              type="button"
              onClick={() => onAccent(a.id)}
              aria-pressed={on}
              className={`flex flex-1 flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-colors ${
                on ? "border-ink/50 bg-box" : "border-line/80 hover:border-ink/30"
              }`}
            >
              <span
                className="h-7 w-7 rounded-full border border-black/10"
                style={{ backgroundColor: a.dot }}
              />
              <span className="text-[11px] leading-tight">{a.label}</span>
            </button>
          );
        })}
      </div>

      <p className={`${LABEL} mt-6 block`}>Light or dark</p>
      <div className="mt-2 flex gap-2.5">
        {THEMES.map((t) => {
          const on = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={(e) => onTheme(t.id, e)}
              aria-pressed={on}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors ${
                on ? "border-ink/50 bg-box" : "border-line/80 hover:border-ink/30"
              }`}
            >
              <span className="text-[12px] leading-tight">{t.label}</span>
              <span className="text-[10px] leading-tight text-muted">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onNext} className={`${PRIMARY} mt-7`}>
        Finish
      </button>
    </>
  );
}

/* Applying a look, in one place so the step and the page cannot disagree
   about what "chose an accent" means. Exported because the page owns the
   state and the step only reports clicks. */

export function chooseAccent(id: string) {
  applyAccent(id);
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    /* private browsing; the account copy below still carries it */
  }
  void fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: ACCENT_KEY, value: id }),
  }).catch(() => {});
}

export function chooseTheme(choice: ThemeChoice, origin?: { x: number; y: number }) {
  writeTheme(choice);
  try {
    /* The first-run chooser in ThemeGate keys off this. Setting it here means
       somebody who has just been asked the question on this screen is not
       asked it again by a full-screen splash the moment they arrive. */
    localStorage.setItem("os-theme-chosen", "1");
  } catch {
    /* the splash reappearing is survivable; nothing else depends on this */
  }
  applyDarkPalette();
  /* Through the event rather than directly, so the paint sweep plays from the
     click point exactly as it does everywhere else in the OS. ThemeGate is
     mounted on the (os) layout and not here, so fall back to a plain apply. */
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("os-set-theme", { detail: { choice, origin } })
    );
  }
  applyTheme(choice);
  void fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "os-theme", value: choice }),
  }).catch(() => {});
}

/* ── Finished ──────────────────────────────────────────────────────────────
   A beat, and then the door. The tour choice deliberately lives on the other
   side of it, inside the OS, so the first thing they see is the real thing
   with their own name in the corner rather than one more setup screen. */

export function Finished({ name, onEnter }: { name: string; onEnter: () => void }) {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return (
    <div className="text-center">
      <div className="intro-rise mb-4 flex justify-center">
        <img
          src="/illustrations/people/welcome.svg"
          alt=""
          aria-hidden
          /* .art, not .art-figure: the convention in globals.css is that line
             art ships as SVG and gets inverted for the dark room, and filled
             figures ship as PNG and opt out. This one is an SVG. */
          className="art h-48 w-auto object-contain"
        />
      </div>
      <h1 className="hand intro-rise-late text-[26px] leading-tight">
        That is you set up{first ? `, ${first}` : ""}.
      </h1>
      <p className="intro-rise-late mt-3 text-[12.5px] leading-relaxed text-muted">
        Next we will show you round. It takes two minutes, or one if you are in a
        hurry, and you can leave it until later.
      </p>
      <button type="button" onClick={onEnter} className={`${PRIMARY} mt-6`}>
        Take me in
      </button>
    </div>
  );
}
