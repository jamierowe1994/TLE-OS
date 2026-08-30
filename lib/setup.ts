/**
 * Setting up an account — the five things we ask for, in the order we ask.
 *
 * ── Why one thing per screen ──────────────────────────────────────────────
 *
 * The whole flow could be a single form. It deliberately isn't. A new agent
 * meets this once, on their first morning, usually on somebody else's
 * schedule, and a page with five sections is a page they scroll past. One
 * question at a time means the screen can carry the reason for the question
 * next to the question, which is the part that actually gets read.
 *
 * ── The order is an argument, not a list ──────────────────────────────────
 *
 *  1. password  — they are already signed in by the time they see it (the
 *                 magic link signs them in as it burns), so this is the only
 *                 step that has already happened when the wizard opens. It is
 *                 still SHOWN, ticked, because a progress bar that starts at
 *                 20% explains itself and one that starts at 0% lies.
 *  2. rex       — first, because REX is where every figure in the OS comes
 *                 from. An agent who skips this reaches a dashboard of empty
 *                 tiles and reports the OS as broken, which is exactly the
 *                 bug report we cannot afford during a pilot.
 *  3. email     — SKIPPABLE, and the only one. It needs a working Microsoft
 *                 365 sign-in, and somebody standing at a desk on day one may
 *                 simply not have one yet. Blocking on it would strand them.
 *  4. how       — what a pre-launch actually is, and what we need back. This
 *                 sits AFTER the connecting and before the decorating: it is
 *                 the one screen we want them to read, so it goes where the
 *                 admin is finished and the fun hasn't started.
 *  5. look      — accent and light/dark. Last on purpose. It is the only step
 *                 with no wrong answer, and ending on a choice that is purely
 *                 theirs is a better last taste than a password rule.
 *
 * Client-safe by design — no `server-only`, no database, no prose heavy
 * enough to regret shipping to the browser. The wizard renders this and
 * `app/api/setup/route.ts` reads the same ids back, so a step cannot be
 * renamed in one place and silently missed in the other.
 */

export type SetupStepId = "password" | "rex" | "email" | "how" | "look";

export type TourChoice = "full" | "fast" | "skipped";

/** What we store per person, under the `os-setup` key in os_user_prefs. */
export type SetupState = {
  /** ISO stamps, one per step answered. Presence is the answer. */
  done: Partial<Record<SetupStepId, string>>;
  /** Email was passed over rather than connected. Recorded so we can ask again. */
  emailSkipped?: boolean;
  finishedAt?: string;
  tour?: TourChoice;
  tourAt?: string;
};

export const EMPTY_SETUP: SetupState = { done: {} };

/**
 * What the server tells the browser.
 *
 * `rexConnected` and `emailConnected` are DERIVED at read time from
 * os_rex_tokens and os_ms_tokens rather than stored as flags here. A flag
 * would drift the moment somebody disconnects REX from their profile: the
 * account would still claim setup was complete while every tile went blank.
 * The row existing is the truth; nothing else is allowed to have an opinion.
 */
export type SetupView = {
  ok: boolean;
  /**
   * Is there a database behind this at all?
   *
   * False on a dev machine — there is no local Postgres and there is not
   * going to be one, so the wizard keeps its state in sessionStorage instead
   * and the whole flow can still be driven. This mirrors what lib/db.ts
   * already does everywhere else rather than inventing a second convention.
   */
  db: boolean;
  signedIn: boolean;
  name: string;
  email: string;
  rexConnected: boolean;
  emailConnected: boolean;
  state: SetupState;
};

export const STEP_ORDER: SetupStepId[] = ["password", "rex", "email", "how", "look"];

/**
 * Email is the only one somebody may pass over.
 *
 * Kept as a set rather than a boolean on each step so the gate can ask the
 * question directly — `REQUIRED.has(id)` — instead of every caller
 * re-deriving "which ones actually block".
 */
export const REQUIRED: ReadonlySet<SetupStepId> = new Set<SetupStepId>([
  "password",
  "rex",
  "how",
  "look",
]);

export type StepMeta = {
  id: SetupStepId;
  /** The rail-style short name, for the progress dots. */
  short: string;
  /** The question, as asked on the screen. */
  title: string;
  /** One line under it. Says why, never what — the screen shows what. */
  blurb: string;
};

export const STEPS: StepMeta[] = [
  {
    id: "password",
    short: "Password",
    title: "Your password",
    blurb: "Done — you set this when you followed the link in your email.",
  },
  {
    id: "rex",
    short: "REX",
    title: "Connect your REX",
    blurb:
      "Everything the OS shows you is your own work, pulled from REX. Until this is connected there is nothing for it to show.",
  },
  {
    id: "email",
    short: "Email",
    title: "Connect your email",
    blurb:
      "So anything you send from the OS goes from your address, in your name, and lands in your Sent items.",
  },
  {
    id: "how",
    short: "How this works",
    title: "How the pre-launch works",
    blurb: "The one screen worth reading. It is short.",
  },
  {
    id: "look",
    short: "Look",
    title: "Make it yours",
    blurb: "No wrong answers here, and you can change it whenever you like.",
  },
];

export function stepMeta(id: SetupStepId): StepMeta {
  // Non-null: STEPS is keyed by the same union, and the compiler holds it.
  return STEPS.find((s) => s.id === id)!;
}

/** Has this step been answered? REX and email ask the world, not the record. */
export function isStepDone(id: SetupStepId, view: SetupView): boolean {
  /* Always. You cannot be looking at any of this without a session, and you
     cannot hold a session without having chosen a password - the magic link
     signs you in as it burns. Reading it off the record instead meant the
     first pip sat unticked on a step that had demonstrably happened, which
     made the whole rail look broken before anybody had answered anything. */
  if (id === "password") return true;
  if (id === "rex") return view.rexConnected;
  if (id === "email") return view.emailConnected || Boolean(view.state.emailSkipped);
  return Boolean(view.state.done[id]);
}

/**
 * The first step still wanting an answer, or null when there are none.
 *
 * Walks in STEP_ORDER rather than jumping to the first gap, so somebody who
 * disconnects REX later is sent back to REX and not to whatever came after it.
 */
export function firstUnfinished(view: SetupView): SetupStepId | null {
  for (const id of STEP_ORDER) {
    if (!isStepDone(id, view)) return id;
  }
  return null;
}

/**
 * Has this person EVER finished setting up? The gate's question, and a
 * one-way door.
 *
 * There used to be a `setupComplete` beside this that asked whether every
 * required step was satisfied right now. It has been deleted rather than left
 * unused, because it is exactly the function somebody would reach for when
 * adding the next gate, and it is the wrong one. If you want "is this account
 * currently in good order" - for a nudge, a banner, an admin column - build it
 * out of `isStepDone` at the call site and be explicit that it is a live
 * question. Do not resurrect a general-purpose one for a gate to grab.
 *
 * ── Why this is not `setupComplete` ───────────────────────────────────────
 *
 * The gate used to ask whether every required step was currently satisfied,
 * and that was a bug with a fuse on it. `isStepDone("rex")` reads the live
 * token table, and a REX session lasts fourteen days (lib/rex-user.ts). So an
 * agent who took a fortnight off, or whose token simply aged out, would sign
 * in and be redirected into the new-starter wizard - asked to choose an
 * accent again, read the pre-launch explanation again, and generally told the
 * product had forgotten them. James caught it the first time he signed in:
 * "as soon as they've done the setup once, that will never happen again. Make
 * that a hard rule."
 *
 * So it is a stamp, not a calculation. `finishedAt` is written once, when
 * somebody presses the last button, and nothing re-derives it afterwards.
 *
 * ── What we give up, and why it is fine ───────────────────────────────────
 *
 * A lapsed REX connection no longer drags anybody back here. That is the
 * point, but it does mean the disconnection has to be surfaced somewhere
 * else - it shows on the profile's Connections tab, and an expiring session
 * renews itself silently while somebody works. Onboarding is the wrong tool
 * for "your sign-in expired": it is the tool for "you have never been here
 * before", and that is true exactly once.
 */
export function setupFinished(view: SetupView): boolean {
  return Boolean(view.state.finishedAt);
}
