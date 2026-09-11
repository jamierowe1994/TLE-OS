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
  chooseTheme,
} from "@/components/setup/steps";
import { useSetup } from "@/lib/setup-store";
import { firstUnfinished, isStepDone, STEP_ORDER, type SetupStepId } from "@/lib/setup";
import { readTheme, type ThemeChoice } from "@/lib/theme";
import { mailboxProblem } from "@/lib/mailbox-outcome";

/**
 * The five questions, and the order they are asked in.
 *
 * Lifted out of app/setup/page.tsx so the public preview renders the SAME
 * component rather than a copy of it. A demonstration that has drifted from
 * the thing it demonstrates is worse than no demonstration - James is going to
 * show this to Susan, and the one guarantee worth having is that what she sees
 * is what a new starter gets.
 */

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

  /* The words live in lib/mailbox-outcome so the admin board says the same
     thing. Two screens describing one failure differently is how a support
     call starts. */
  const mailProblem = useMemo(() => mailboxProblem(mail), [mail]);

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
          theme={theme}
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
