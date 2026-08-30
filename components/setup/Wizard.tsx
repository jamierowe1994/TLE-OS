"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 * The five questions, and the order they are asked in.
 *
 * Lifted out of app/setup/page.tsx so the public preview renders the SAME
 * component rather than a copy of it. A demonstration that has drifted from
 * the thing it demonstrates is worse than no demonstration - James is going to
 * show this to Susan, and the one guarantee worth having is that what she sees
 * is what a new starter gets.
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

export default function Wizard({
  replay = false,
  forceDemo = false,
  mail = null,
  onFinish,
}: {
  /** A dry run: walks every screen, writes nothing. */
  replay?: boolean;
  /** Never contact the server. Used by the public preview. */
  forceDemo?: boolean;
  /** ?mail=... coming back from the Microsoft consent screen. */
  mail?: string | null;
  onFinish: () => void;
}) {
  const { view, ready, demo, save } = useSetup(forceDemo);

  const [screen, setScreen] = useState<Screen | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [accent, setAccent] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("auto");

  /* Decided ONCE, on the first load that has an answer. Recomputing it as
     state changes would yank somebody off the step they are halfway through
     the moment their own answer landed. */
  const placed = useRef(false);

  /* A dry run holds its progress here and throws it away with the component.
     Writing it would let somebody previewing the flow reset their own account
     and get bounced back here by the gate every time they open the OS. */
  const [ran, setRan] = useState<Set<SetupStepId>>(() => new Set());
  const dry = replay || forceDemo;

  useEffect(() => {
    setAccent(readAccent());
    setTheme(readTheme() ?? "auto");
  }, []);

  useEffect(() => {
    if (!ready || placed.current) return;
    placed.current = true;

    if (dry) {
      setScreen("welcome");
      return;
    }
    if (mail) {
      setScreen("email");
      return;
    }
    const next = firstUnfinished(view);
    if (next === null) {
      setScreen("finished");
      return;
    }
    /* Greet somebody who has answered nothing yet; send somebody part-way
       through straight back to the question they stopped at. */
    const started = STEP_ORDER.some((id) => id !== "password" && isStepDone(id, view));
    setScreen(started ? next : "welcome");
  }, [ready, dry, mail, view]);

  const mailProblem = useMemo(() => {
    if (!mail || mail === "connected") return null;
    return MAIL_PROBLEM[mail] ?? "That did not connect. You can skip this and try later.";
  }, [mail]);

  const done = useMemo(
    () =>
      dry
        ? (id: SetupStepId) => id === "password" || ran.has(id)
        : (id: SetupStepId) => isStepDone(id, view),
    [dry, ran, view]
  );

  function go(next: Screen, dir: "forward" | "back" = "forward") {
    setDirection(dir);
    setScreen(next);
  }

  async function complete(step: SetupStepId, opts: { skip?: boolean } = {}) {
    if (dry) setRan((s) => new Set(s).add(step));
    else await save({ step, skip: opts.skip });
    const order: Screen[] = ["rex", "email", "how", "look", "finished"];
    go(order[order.indexOf(step) + 1] ?? "finished");
  }

  async function finish() {
    if (!dry) await save({ finished: true });
    onFinish();
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
    <Frame
      current={current}
      done={done}
      direction={direction}
      /* The banner is about there being no database to save into. A preview
         says so on its own frame instead, in words that suit a guest. */
      demo={demo && !forceDemo}
    >
      {screen === "welcome" && (
        <Welcome name={view.name} onNext={() => go(view.rexConnected ? "email" : "rex")} />
      )}

      {screen === "rex" && (
        <StepRex preview={demo || dry} onDone={() => void complete("rex")} />
      )}

      {screen === "email" && (
        <StepEmail
          preview={demo || dry}
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
            chooseAccent(id, !forceDemo);
          }}
          onTheme={(t, e) => {
            setTheme(t);
            chooseTheme(t, { x: e.clientX, y: e.clientY }, !forceDemo);
          }}
          onNext={() => void complete("look")}
        />
      )}

      {screen === "finished" && <Finished name={view.name} onEnter={() => void finish()} />}
    </Frame>
  );
}
