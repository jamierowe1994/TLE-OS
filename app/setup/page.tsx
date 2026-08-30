"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Frame from "@/components/setup/Frame";
import {
  Finished,
  StepEmail,
  StepHow,
  StepLook,
  StepRex,
  Welcome,
  chooseAccent,
  chooseTheme,
} from "@/components/setup/steps";
import { useSetup } from "@/lib/setup-store";
import { firstUnfinished, isStepDone, STEP_ORDER, type SetupStepId } from "@/lib/setup";
import { readAccent } from "@/lib/accents";
import { readTheme, type ThemeChoice } from "@/lib/theme";

/**
 * Setting up an account, one question per screen.
 *
 * Reached the moment a magic link is redeemed: /api/auth/verify/complete signs
 * them in as it burns the token, and /join sends them here instead of to the
 * profile it used to. So by the time this renders there is always a session
 * and always a name.
 *
 * ── Where it resumes ──────────────────────────────────────────────────────
 *
 * At the first UNANSWERED step, not at the last one they saw. Somebody who
 * closes the tab on the email question and comes back tomorrow should land on
 * the email question; somebody who disconnected REX last week should land on
 * REX, even though they answered it once. `firstUnfinished` walks the order
 * rather than jumping to the newest gap, which is what makes both true.
 *
 * ── ?replay=1 ─────────────────────────────────────────────────────────────
 *
 * Starts at the welcome regardless. This exists so the flow can actually be
 * looked at more than once: it is the screen with the highest ratio of "seen
 * by everybody once" to "seen by us while building it", and without a way to
 * replay it the only way to review a change was to make a new account.
 */

/** What Microsoft told us on the way back, in English. */
const MAIL_PROBLEM: Record<string, string> = {
  denied: "Microsoft would not allow that. If you cancelled, you can skip this and connect it later.",
  state: "That took too long and the sign-in expired. Try connecting again.",
  norefresh:
    "Microsoft connected but did not grant a lasting permission, so it would stop working within the hour. Try again, and accept the permissions it asks for.",
  failed: "Something went wrong connecting Microsoft. You can skip this and try later from your profile.",
  signin: "You were signed out on the way back. Sign in and try again.",
};

type Screen = "welcome" | SetupStepId | "finished";

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const replay = params.get("replay") === "1";
  const mail = params.get("mail");

  const { view, ready, demo, save, refresh } = useSetup();

  const [screen, setScreen] = useState<Screen | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [accent, setAccent] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("auto");

  /* The opening screen is decided ONCE, on the first load that has an answer.
     Recomputing it as state changes would yank somebody off the step they are
     halfway through the moment their own answer landed. */
  const placed = useRef(false);

  useEffect(() => {
    setAccent(readAccent());
    setTheme(readTheme() ?? "auto");
  }, []);

  useEffect(() => {
    if (!ready || placed.current) return;
    placed.current = true;

    if (replay) {
      setScreen("welcome");
      return;
    }
    /* Coming back from Microsoft: land on the email step so the outcome is
       shown against the question that caused it, rather than three screens on. */
    if (mail) {
      setScreen("email");
      return;
    }
    const next = firstUnfinished(view);
    if (next === null) {
      setScreen("finished");
      return;
    }
    /* Greet somebody who has answered nothing yet; send somebody who is
       part-way through straight back to the question they stopped at. Being
       welcomed to a thing you started yesterday reads as having lost your
       place. The password never counts as started - it was answered by the
       act of arriving. */
    const started = STEP_ORDER.some((id) => id !== "password" && isStepDone(id, view));
    setScreen(started ? next : "welcome");
  }, [ready, replay, mail, view]);

  /* Microsoft redirects back with ?mail=connected but the connection itself is
     a row in a table we have not re-read. Ask again, once. */
  const asked = useRef(false);
  useEffect(() => {
    if (!mail || asked.current) return;
    asked.current = true;
    void refresh();
  }, [mail, refresh]);

  const mailProblem = useMemo(() => {
    if (!mail || mail === "connected") return null;
    return MAIL_PROBLEM[mail] ?? "That did not connect. You can skip this and try later.";
  }, [mail]);

  /**
   * Replay is a DRY RUN. It writes nothing.
   *
   * It reset the stored record at first, which was a trap with James's and
   * Susan's names on it: wiping `finishedAt` on a finished account means the
   * gate starts bouncing them back here, and walking out half way through
   * leaves them locked out of the OS until they finish a wizard they only
   * opened to look at. Nobody previewing a screen should be able to lock
   * themselves out by closing the tab.
   *
   * So progress during a replay is held here, in this component, and thrown
   * away with it. The pips tick, the flow reads exactly as a new starter's
   * does, and the account is untouched.
   */
  const [ran, setRan] = useState<Set<SetupStepId>>(() => new Set());

  const done = useMemo(
    () =>
      replay
        ? (id: SetupStepId) => id === "password" || ran.has(id)
        : (id: SetupStepId) => isStepDone(id, view),
    [replay, ran, view]
  );

  function go(next: Screen, dir: "forward" | "back" = "forward") {
    setDirection(dir);
    setScreen(next);
  }

  /** Finish a step, record it, and move to the next thing still wanting one. */
  async function complete(step: SetupStepId, opts: { skip?: boolean } = {}) {
    if (replay) setRan((s) => new Set(s).add(step));
    else await save({ step, skip: opts.skip });
    const order: Screen[] = ["rex", "email", "how", "look", "finished"];
    const at = order.indexOf(step);
    go(order[at + 1] ?? "finished");
  }

  async function enterOs() {
    if (!replay) await save({ finished: true });
    /* ?tour=choose is what makes the OS offer the tour. Carried in the URL
       rather than inferred from "setup just finished", so the tour can also be
       re-run later from Steve without pretending setup happened again. */
    router.push("/dashboard?tour=choose");
  }

  if (!ready || screen === null) {
    return (
      <Frame current={null} done={() => false}>
        <p className="text-[12.5px] text-muted">Just a moment…</p>
      </Frame>
    );
  }

  const current: SetupStepId | null =
    screen === "welcome" || screen === "finished" ? null : screen;

  return (
    <Frame current={current} done={done} direction={direction} demo={demo}>
      {screen === "welcome" && (
        <Welcome name={view.name} onNext={() => go(view.rexConnected ? "email" : "rex")} />
      )}

      {screen === "rex" && (
        <StepRex preview={demo || replay} onDone={() => void complete("rex")} />
      )}

      {screen === "email" && (
        <StepEmail
          preview={demo || replay}
          problem={mailProblem}
          onSkip={() => void complete("email", { skip: true })}
        />
      )}

      {screen === "how" && <StepHow onNext={() => void complete("how")} />}

      {screen === "look" && (
        <StepLook
          accent={accent}
          theme={theme}
          onAccent={(id) => {
            setAccent(id);
            chooseAccent(id);
          }}
          onTheme={(t, e) => {
            setTheme(t);
            chooseTheme(t, { x: e.clientX, y: e.clientY });
          }}
          onNext={() => void complete("look")}
        />
      )}

      {screen === "finished" && <Finished name={view.name} onEnter={() => void enterOs()} />}
    </Frame>
  );
}

export default function SetupPage() {
  /* useSearchParams needs a boundary or the route opts out of static
     rendering and the build says so. Same shape as /join. */
  return (
    <Suspense
      fallback={
        <Frame current={null} done={() => false}>
          <p className="text-[12.5px] text-muted">Just a moment…</p>
        </Frame>
      }
    >
      <Setup />
    </Suspense>
  );
}
