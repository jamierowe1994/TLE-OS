"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_SETUP,
  type SetupState,
  type SetupStepId,
  type SetupView,
  type TourChoice,
} from "@/lib/setup";

/**
 * One place that answers "where is this person up to", whether or not there
 * is a database behind it.
 *
 * ── The demo copy ─────────────────────────────────────────────────────────
 *
 * There is no local Postgres on the dev machine, and enabling one would mean
 * exposing the production database to the internet over a TCP proxy. So when
 * /api/setup answers `db: false`, this keeps the same SetupState in
 * sessionStorage and everything above it carries on unchanged.
 *
 * sessionStorage, not localStorage, and that is the whole trick: closing the
 * tab resets it. The flow is meant to be walked repeatedly while it is being
 * designed, and a harness you have to remember to clear is a harness that
 * quietly shows you yesterday's answers.
 *
 * This is UI progress, not a figure. The live-data rule in CLAUDE.md exists
 * because a stale number on a tile is indistinguishable from a true one on a
 * call with Susan; "which step am I on" has no such failure mode, and the
 * screen says out loud when it is running without a database.
 */

const DEMO_KEY = "os-setup-demo";

function readDemo(): SetupState {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY);
    if (!raw) return { ...EMPTY_SETUP, done: {} };
    const parsed = JSON.parse(raw) as SetupState;
    return { ...EMPTY_SETUP, ...parsed, done: parsed.done ?? {} };
  } catch {
    return { ...EMPTY_SETUP, done: {} };
  }
}

function writeDemo(state: SetupState) {
  try {
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {
    /* private browsing — the flow still works, it just won't survive a reload */
  }
}

export function clearDemo() {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type SetupChange = {
  step?: SetupStepId;
  skip?: boolean;
  finished?: boolean;
  tour?: TourChoice;
  reset?: boolean;
};

/** Apply a change to a state object. Pure, so both paths agree by construction. */
function apply(state: SetupState, change: SetupChange): SetupState {
  if (change.reset) return { ...EMPTY_SETUP, done: {} };
  const now = new Date().toISOString();
  const next: SetupState = { ...state, done: { ...state.done } };
  if (change.step) {
    next.done[change.step] = now;
    if (change.step === "email") next.emailSkipped = change.skip === true;
  }
  if (change.finished) next.finishedAt = now;
  if (change.tour) {
    next.tour = change.tour;
    next.tourAt = now;
  }
  return next;
}

const BLANK: SetupView = {
  ok: false,
  db: false,
  signedIn: false,
  name: "",
  email: "",
  rexConnected: false,
  emailConnected: false,
  state: { ...EMPTY_SETUP, done: {} },
};

export type SetupStore = {
  view: SetupView;
  /** Has the first read landed? Nothing should redirect before this is true. */
  ready: boolean;
  /** True when there is no database and the browser is holding the answers. */
  demo: boolean;
  save: (change: SetupChange) => Promise<void>;
  /** Re-read from the server — after connecting REX or email in a popup. */
  refresh: () => Promise<void>;
};

/**
 * @param forceDemo Never contact the server at all.
 *
 * For the public onboarding preview, where there is no session and must be no
 * writes. Without it the preview would still call /api/setup on load - it
 * would answer "signed out" harmlessly, but a page shared with somebody
 * outside the company should not be reaching for our API at all. Belt as well
 * as braces: the route is exempt from middleware, so the only thing standing
 * between it and the rest of the OS is that it does not ask.
 */
export function useSetup(forceDemo = false): SetupStore {
  const [view, setView] = useState<SetupView>(BLANK);
  const [ready, setReady] = useState(false);
  /* The latest view, readable without being a dependency.
     `save` needs to know the current state and whether there is a database,
     and neither may come from the closure: a state updater that computes its
     side effect inline runs twice under StrictMode, and a `view` dependency
     would rebuild `save` on every keystroke the wizard causes. */
  const latest = useRef(view);
  latest.current = view;

  const load = useCallback(async () => {
    let server: SetupView;
    if (forceDemo) {
      server = { ...BLANK };
    } else {
      try {
        const r = await fetch("/api/setup", { cache: "no-store" });
        server = (await r.json()) as SetupView;
      } catch {
        server = { ...BLANK };
      }
    }

    if (server.db) {
      setView(server);
    } else {
      /* No database: the server still tells us the truth about REX and email
         (both false without one), and the browser supplies the progress.
         The name stays EMPTY rather than getting a plausible stand-in. Every
         screen already reads properly without one, and inventing a person is
         how James ended up looking at his own details on Susan's profile. */
      setView({ ...server, db: false, state: readDemo() });
    }
    setReady(true);
  }, [forceDemo]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (change: SetupChange) => {
    /* Optimistic on both paths. The wizard advances on the next frame and a
       step that failed to persist is recoverable by walking it again — a
       spinner between every screen would make five questions feel like ten. */
    const current = latest.current;
    const applied = apply(current.state, change);
    setView((v) => ({ ...v, state: applied }));

    if (current.db) {
      /**
       * Tried twice, and that is not belt-and-braces for its own sake.
       *
       * `finished: true` is the stamp the gate reads forever after. If it is
       * lost to one flaky request, the person is walked through the whole
       * new-starter wizard again on their next sign-in - which is the exact
       * thing this write exists to prevent. A single retry turns the common
       * transient failure into a non-event.
       *
       * Still best-effort by design: a step that genuinely fails to save is
       * recoverable by walking it again, and blocking the screen on a spinner
       * would make five questions feel like ten.
       */
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch("/api/setup", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(change),
          });
          if (r.ok) break;
        } catch {
          /* fall through to the retry */
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    } else if (change.reset) {
      clearDemo();
    } else {
      writeDemo(applied);
    }
  }, []);

  return { view, ready, demo: ready && !view.db, save, refresh: load };
}
