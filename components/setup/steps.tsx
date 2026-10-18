"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import RexDino from "@/components/RexDino";
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

export function Welcome({
  name,
  rexOptional = false,
  onNext,
}: {
  name: string;
  /** Not an agent: REX is offered rather than required, so say so. */
  rexOptional?: boolean;
  onNext: () => void;
}) {
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
        {rexOptional
          ? "Your password is set, so your account exists. A few more things and the OS is yours: your REX if you use it, your email, and how to get help."
          : "Your password is set, so your account exists. Three more things and the OS is yours: your REX, your email, and how to get help."}
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
  optional = false,
  onDone,
  onSkip,
}: {
  /** Previewing rather than joining: no database, or an owner replaying. */
  preview: boolean;
  /** Not an agent (marketing, compliance, pre-tenancy, the office): REX can be passed over. */
  optional?: boolean;
  onDone: () => void;
  /** "I don't use REX" - recorded as the answer, so the setup gate lets them through. */
  onSkip?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* REX has said no at least once. Only then is an agent offered a way past
     (16 Oct 2026): Rovena Buci, Tony Poon and Ed Westwood each sat on this
     screen after REX refused their password, with nothing to press. */
  const [refused, setRefused] = useState(false);

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
      const j = (await r.json()) as { ok?: boolean; error?: string; refused?: boolean };
      if (j.ok) onDone();
      else {
        setError(j.error ?? "REX would not accept that. Check the address and try again.");
        if (r.status === 401) setRefused(true);
      }
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

      {/* The running gag, and it only works because the next screen pays it
          off. Set in the handwriting face and sized like a pencil note under a
          drawing, so it reads as the artist signing it rather than as a caption
          the product wrote about itself. */}
      <div className="my-7 flex flex-col items-center gap-2.5 text-ink">
        <RexDino size={230} />
        <p className="hand text-[11.5px] text-muted">This is the one James drew.</p>
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
      {optional && !preview && onSkip && (
        <button type="button" onClick={onSkip} className={`${GHOST} mt-3`}>
          I don&apos;t use REX, skip this
        </button>
      )}
      {!optional && !preview && onSkip && refused && (
        <>
          <button type="button" onClick={onSkip} className={`${GHOST} mt-3`}>
            Carry on and connect REX later
          </button>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            You can still use the OS. Connect REX from your Profile once you have your REX
            password, and anything that needs it will ask you then.
          </p>
        </>
      )}
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

/**
 * The tick, drawn rather than stamped.
 *
 * Same path as the progress rail's Pip so the one on the rail and the one in
 * the middle of the screen are visibly the same mark. It draws itself on with
 * stroke-dashoffset, which is the only honest way to animate a tick: it is a
 * stroke, and a stroke that fades in reads as a picture appearing rather than
 * as something being completed. Reduced motion gets the finished mark with no
 * drawing and no ring.
 */
function BigTick() {
  return (
    <span
      className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent-dark text-page motion-safe:animate-[tickPop_0.42s_cubic-bezier(0.22,1,0.36,1)_both]"
      aria-hidden
    >
      <svg viewBox="0 0 12 12" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M2.5 6.4 4.8 8.7 9.5 3.6"
          pathLength={1}
          className="motion-safe:animate-[tickDraw_0.5s_cubic-bezier(0.22,1,0.36,1)_0.14s_both]"
        />
      </svg>
    </span>
  );
}

/** What the live check came back with. */
type MailCheck =
  | { state: "checking" }
  | { state: "connected"; email: string | null }
  | { state: "no"; problem: string | null };

export function StepEmail({
  preview,
  problem,
  connected = false,
  mailbox = null,
  justConnected = false,
  onNext,
  onSkip,
}: {
  preview: boolean;
  /** Whatever Microsoft said on the way back, already turned into English. */
  problem: string | null;
  /** What /api/setup last said. A hint for the first paint, not the answer. */
  connected?: boolean;
  /** The address that connection sends as, as far as /api/setup knows. */
  mailbox?: string | null;
  /** They have just come back from the consent screen having said yes. */
  justConnected?: boolean;
  /** Confirmed and moving on. */
  onNext: () => void;
  onSkip: () => void;
}) {
  /* WHY THIS SCREEN ASKS AT ALL (18 Oct 2026).
     The callback redirected to /setup?mail=connected and this component drew
     the same "Connect Your Email" screen it had drawn a minute earlier, with
     the same button. New starters read that as a failure: some connected two
     and three times over, and the rest messaged James to say it was broken.
     Nothing was broken except that nobody had been told.

     So when there is any reason to think a mailbox is there, the screen asks
     Microsoft rather than guessing - a row in our own table proves a token was
     stored, not that it works - and says so plainly either way. */
  const shouldCheck = !preview && (justConnected || connected);
  /* A preview has no mailbox to ask about, so it SHOWS the confirmation
     rather than asking: /setup?replay=1&mail=connected walks somebody through
     the screen a connected agent gets. Without this the one screen nobody
     could see before shipping would stay the one screen nobody can see. */
  const [check, setCheck] = useState<MailCheck>(
    preview && justConnected
      ? { state: "connected", email: mailbox }
      : shouldCheck
        ? { state: "checking" }
        : { state: "no", problem: null }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!shouldCheck) return;
    let alive = true;
    setCheck({ state: "checking" });
    (async () => {
      try {
        const r = await fetch("/api/mailbox/check", { cache: "no-store" });
        const d = (await r.json()) as { connected?: boolean; email?: string | null; problem?: string | null };
        if (!alive) return;
        if (d.connected) {
          setCheck({ state: "connected", email: d.email ?? mailbox ?? null });
          return;
        }
        /* One retry, once, and only for somebody who has just come back from
           Microsoft. The token is written in the callback a redirect before
           this runs, so a check that lands first would otherwise tell a person
           who did everything right that nothing happened. */
        if (justConnected && attempt === 0) {
          setTimeout(() => alive && setAttempt(1), 1200);
          return;
        }
        setCheck({ state: "no", problem: d.problem ?? null });
      } catch {
        if (!alive) return;
        setCheck({
          state: "no",
          problem: "We could not check your mailbox just then. Try again in a moment.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [shouldCheck, justConnected, attempt, mailbox]);

  if (check.state === "checking") {
    return (
      <>
        <Title>Checking Your Email</Title>
        <Blurb>One moment. We are asking Microsoft whether that connected.</Blurb>
        <div className="my-10 flex flex-col items-center gap-3">
          <span
            className="h-9 w-9 rounded-full border-[2.5px] border-line border-t-accent-dark motion-safe:animate-spin"
            aria-hidden
          />
          <p className="text-[11.5px] text-muted" role="status">
            Checking your mailbox
          </p>
        </div>
      </>
    );
  }

  if (check.state === "connected") {
    return (
      <>
        <Title>Your Email Is Connected</Title>
        <Blurb>
          That worked. Nothing else to do on this step.
        </Blurb>

        <div className="my-8 flex flex-col items-center gap-4">
          <BigTick />
          {check.email && (
            <p className="text-center text-[13px] leading-relaxed">
              Email from the OS will go out as{" "}
              <strong className="font-semibold">{check.email}</strong>
            </p>
          )}
          <p className="max-w-[18rem] text-center text-[11.5px] leading-relaxed text-muted">
            In your name, from your address, and it lands in your own Sent
            items. Replies come back to you.
          </p>
        </div>

        <button type="button" onClick={onNext} className={`${PRIMARY} mt-1`}>
          Next
        </button>

        <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
          You can test it, change it or disconnect it any time from your
          profile.
        </p>
      </>
    );
  }

  return (
    <>
      <Title>Connect Your Email</Title>
      <Blurb>
        So anything you send from the OS goes from your address, in your name,
        and lands in your own Sent items.
      </Blurb>

      {/* The payoff. Do not remove one of these without removing the other -
          on its own, either line is a non-sequitur. */}
      <div className="my-7 flex flex-col items-center gap-2.5">
        <img
          src="/illustrations/notioly/paper-airplane.png"
          alt=""
          aria-hidden
          className="art-figure h-44 w-auto object-contain"
        />
        <p className="hand text-[11.5px] text-muted">
          James did not draw this one, though.
        </p>
      </div>

      {/* Microsoft's own reason first, because it names the thing to do about
          it; the check's wording only stands in when the trip back said
          nothing was wrong and the mailbox still is not there. */}
      {(problem || check.problem) && <Problem>{problem ?? check.problem}</Problem>}

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

/* ── Getting help ──────────────────────────────────────────────────────────
   The one screen we actually want read, which is why it sits after the
   connecting is done and before the decorating starts.

   James: "explain the rules, so don't call it rules". So it is framed as what
   we need FROM them rather than what is expected OF them. Until launch day
   (14 Oct 2026) this was "How The Pre-launch Works" and opened on "This is
   early, on purpose"; a new starter joining now is joining a live system, so
   it says where help is and how to tell us something is wrong. */

const POINTS: { icon: string; head: string; body: string }[] = [
  {
    icon: "info",
    head: "Steve is there when you are stuck",
    body: "Ask him how to do anything, or open his Guides for a step-by-step walk-through of the real screens. He sits in the bottom right of every screen.",
  },
  {
    icon: "cross",
    head: "If something looks wrong, tell us",
    body: "A figure that disagrees with what you know, a button that does nothing, a screen that confuses you. Report it from the same corner. It takes a picture of what you were looking at, so you do not have to explain where you were.",
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
      <Title>How to Get Help</Title>
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
        Do not assume somebody else has already reported it, because usually
        nobody has. We will point at the button in a minute.
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
  theme,
  onTheme,
  onNext,
}: {
  theme: ThemeChoice;
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
   about what "chose a theme" means. Exported because the page owns the
   state and the step only reports clicks. `persist` is false in the public
   preview: the screen still changes, because seeing it is the point of the
   step, but a page shared outside the company does not call our API. */
export function chooseTheme(
  choice: ThemeChoice,
  origin?: { x: number; y: number },
  persist = true
) {
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
  if (!persist) return;
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
      {/* The one genuinely celebratory beat in the product, so it moves.
          .art on both: they are ink on transparent, which globals.css inverts
          for the dark room. The class keys off what the image IS, not its
          extension - a GIF of line art belongs in the same bucket as the SVGs.

          TWO images, and the still is not a nicety. A GIF cannot honour
          prefers-reduced-motion the way every animation in globals.css does -
          it just plays. So somebody who has asked their machine for less
          movement gets the drawing this screen used to have, which is a real
          picture rather than a frozen frame of a party popper mid-bang. */}
      <div className="intro-rise mb-4 flex justify-center">
        <img
          src="/illustrations/party-popper.gif"
          alt=""
          aria-hidden
          className="art h-48 w-auto object-contain motion-reduce:hidden"
        />
        <img
          src="/illustrations/people/welcome.svg"
          alt=""
          aria-hidden
          className="art hidden h-48 w-auto object-contain motion-reduce:block"
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
