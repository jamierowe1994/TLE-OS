"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";
import { captureScreen } from "@/lib/screenshot";
import AssistantSays, { type Screen } from "@/components/AssistantSays";
import { getOpenListing, getOpenSurfaces } from "@/lib/open-record";

/**
 * The character in the corner, and what he says.
 *
 * ── A speech bubble, not a panel ──────────────────────────────────────────
 *
 * James, 29 Aug: "in a perfect world I would love to be able to show this
 * rather than in a square… it should be almost in a speech bubble."
 *
 * The tail is the whole point. A floating card near a character is a UI panel
 * that happens to be nearby; a bubble with a tail pointing at his head is HIM
 * TALKING. Same pixels, completely different relationship — and it is what
 * makes the thinking animation mean something, because you can see who is
 * doing the thinking.
 *
 * ── The introduction ──────────────────────────────────────────────────────
 *
 * First time someone opens him he asks their name, then what they think they
 * will need most help with. We know the name already; asking is the point. It
 * is an introduction, and a thing you have been introduced to gets treated
 * differently from a form. The second answer is the genuinely useful one — it
 * is every agent telling us, before they have been disappointed by anything,
 * what they expect to struggle with.
 *
 * ── Two things carried from the old ReportBug ─────────────────────────────
 *
 * The page tracker and the signed-out guard. Neither has anything to do with
 * the button and everything to do with this being the one component mounted on
 * every page — losing the tracker would silently end the record of who went
 * where.
 */

/* One minute to reach for his phone, another before he nods off. James asked
   for a minute; splitting it in two means you occasionally catch him mid-scroll
   rather than only ever finding him asleep. */
const PHONE_MS = 60_000;
const SLEEP_MS = 120_000;

type Line = {
  role: "agent" | "assistant";
  text: string;
  /** What he went and read to answer. Absent on history and on his own
   *  scripted lines; only a live tool-using reply has any. */
  steps?: string[];
  /** Something he is offering to do, and our own sealed copy of it. The card
   *  renders from `card`; the button sends `sealed` back untouched, because
   *  what executes must be what the server composed. */
  card?: Proposal;
  sealed?: string;
  /** Set once the button has been pressed, so it cannot be pressed twice. */
  settled?: string;
};

/** Mirrors ActionProposal server-side, narrowed to what the card draws. */
type Proposal = {
  kind: "note" | "reminder" | "write-up" | "email";
  address?: string | null;
  text?: string;
  title?: string;
  startsAt?: string;
  heading?: string;
  body?: string;
  toName?: string;
  toEmail?: string;
  subject?: string;
};

/* What each card says on it. Kept out of the markup so the promise a button
   makes and the words next to it can never drift apart. */
const CARD_TITLE: Record<Proposal["kind"], string> = {
  note: "Note, ready to save",
  reminder: "Reminder, ready to set",
  "write-up": "New advert, ready to publish",
  email: "Email, ready to send",
};
const CARD_BUTTON: Record<Proposal["kind"], string> = {
  note: "Save note",
  reminder: "Set reminder",
  "write-up": "Publish it",
  email: "Send it",
};
/* The consequence, spelled out. Somebody pressing a button in a chat bubble
   deserves to know it reaches Rightmove. */
const CARD_EFFECT: Record<Proposal["kind"], string> = {
  note: "Saves to the property file in the OS. Not sent to REX.",
  reminder: "Goes in the OS diary only - not REX, not your 365 calendar.",
  "write-up": "Writes to REX and goes live on Rightmove, Zoopla and OnTheMarket in about five to ten minutes.",
  email: "Sends from YOUR Microsoft mailbox, so it is in your Sent Items and their reply threads onto it. BCC'd to REX so it shows on their timeline. The address is looked up again when you press - it always goes to the person on the record.",
};

export default function HelpDock() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"help" | "guides" | "feedback">("help");

  const [lines, setLines] = useState<Line[]>([]);
  const [stage, setStage] = useState<"ask" | "onboarding-name" | "onboarding-help">("ask");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  /* The screens he is allowed to send anyone to. Comes from the server rather
     than a copy kept here, so a screen added to the rail needs no second edit
     — see the allowlist note in AssistantSays. */
  const [screens, setScreens] = useState<Screen[]>([]);

  /** Brief acknowledgement on the button, so the press is visibly received. */
  const [cleared, setCleared] = useState(false);
  const [kind, setKind] = useState("bug");
  const [fb, setFb] = useState("");
  const [sent, setSent] = useState(false);

  const [mood, setMood] = useState<Mood>("idle");
  /* Mid-performance for the new-starter tour: the gesture loops instead of
     playing once, because he is the only thing on an otherwise blurred screen
     and a two-second wave leaves him standing still while somebody reads. */
  const [performing, setPerforming] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const thread = useRef(String(Date.now()));
  const scroller = useRef<HTMLDivElement | null>(null);
  /** Whether we've already dropped to the bottom since the panel opened. */
  const landed = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: unknown; hasDb?: boolean } | null) =>
        /* Signed in, OR there is no database at all - which on this codebase
           means a developer's laptop and nothing else. `hasDb()` is false only
           when DATABASE_URL is unset, and it is always set in production, so
           this cannot show Steve to a stranger on the live site.

           Without it the assistant simply does not exist locally, and the last
           three steps of the new-starter tour - the ones that teach somebody
           how to report a fault, which is the whole point of a pre-launch -
           could not be looked at before they shipped. */
        setSignedIn(Boolean(j?.user) || j?.hasDb === false)
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!signedIn || !path) return;
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
  }, [path, signedIn]);

  const rest = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setMood("texting"), PHONE_MS),
      setTimeout(() => setMood("asleep"), SLEEP_MS),
    ];
  }, []);

  useEffect(() => {
    if (!signedIn || open) return;
    rest();
    return () => timers.current.forEach(clearTimeout);
  }, [signedIn, open, rest]);

  /**
   * Always sitting on the newest message.
   *
   * James, 29 Aug: "it should always push you down to the bottom of the chat
   * where the most recent message is, because otherwise there's literally no
   * point." Quite - an answer you have to scroll to find is a worse answer.
   *
   * Three things the old one-liner got wrong:
   *
   *   · It only watched `lines` and `busy`, so opening the panel onto a loaded
   *     history left you at the TOP of it, looking at the oldest thing he said.
   *   · It scrolled in the same tick the list grew, before the browser had laid
   *     the new message out, so scrollHeight was still the old height and it
   *     landed one message short. A frame's wait fixes that properly.
   *   · Smooth from the top of a long history is a visible crawl, and it can be
   *     interrupted. Arriving is instant; only replies that land while you are
   *     watching are worth animating.
   */
  useEffect(() => {
    if (!open || tab !== "help") {
      landed.current = false;
      return;
    }
    const el = scroller.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: landed.current ? "smooth" : "auto" });
      /* Only counts as landed once there was something to land ON. Opening
         runs this effect immediately, while the history is still being
         fetched and the list is empty — marking that as arrival would make
         the real history, a moment later, animate slowly down from the top.
         Which is the crawl this was written to avoid. */
      if (lines.length) landed.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [lines, busy, open, tab]);

  /**
   * The new-starter tour driving the dock.
   *
   * The tour's whole job on its last step is to point at Steve and at the
   * feedback form, and the feedback form lives INSIDE this bubble - there is
   * nothing to point at until somebody has opened him. Rather than teach the
   * tour to synthesise clicks on a button it does not own, the dock takes an
   * instruction, the same way Shell and ThemeGate already do.
   *
   * Declared before the `!signedIn` early return below, because a hook that
   * only sometimes runs is a hook that crashes on the render where it stops.
   */
  useEffect(() => {
    /* Timers belonging to the tour's performance, cleared whenever it is
       re-commanded or the dock unmounts. Kept out of `timers` (the ref the
       rest of the dock uses) so cancelling one cannot cancel the other. */
    let show: number[] = [];
    const stop = () => {
      show.forEach(clearTimeout);
      show = [];
    };

    const onCommand = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        open?: boolean;
        tab?: "help" | "guides" | "feedback";
        perform?: boolean;
      };
      if (d?.tab) setTab(d.tab);
      if (d?.open !== undefined) setOpen(d.open);

      stop();
      if (!d?.perform) {
        setPerforming(false);
        if (d?.open === false) setMood("idle");
        return;
      }

      /**
       * The tour is pointing at him, so he does something about it.
       *
       * James, 30 Aug: keep waving while he is being shown off, then flex,
       * then let him drift off if somebody leaves the screen open. The
       * ordinary idle timers cannot do this - they are disabled while the
       * bubble is open (see the effect below), which is correct everywhere
       * except here, where the bubble being open is the whole point.
       *
       * The waving repeats rather than playing once: `nib-lean` runs three
       * times over about two seconds, and a single pass was over before
       * anybody had finished reading the first line about him.
       */
      setPerforming(true);
      setMood("wave");
      show.push(window.setTimeout(() => setMood("flex"), 4200));
      show.push(window.setTimeout(() => {
        setPerforming(false);
        setMood("idle");
      }, 8600));
      /* Long enough that it only happens to somebody who has genuinely
         stopped reading, rather than to somebody who is thinking. */
      show.push(window.setTimeout(() => setMood("texting"), 26000));
      show.push(window.setTimeout(() => setMood("asleep"), 44000));
    };

    window.addEventListener("os-help-dock", onCommand);
    return () => {
      stop();
      window.removeEventListener("os-help-dock", onCommand);
    };
  }, []);

  if (!signedIn) return null;

  async function toggle() {
    timers.current.forEach(clearTimeout);
    const next = !open;
    setOpen(next);
    if (!next) {
      setMood("idle");
      rest();
      return;
    }

    /* Caught napping or mid-scroll, he startles before he greets you. */
    const waking = mood === "asleep" || mood === "texting";
    setMood(waking ? "surprised" : "wave");
    setTimeout(() => setMood("idle"), waking ? 2600 : 1800);

    if (lines.length) return;
    const r = await fetch("/api/assistant/ask", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setLive(Boolean(r?.live));
    setScreens(Array.isArray(r?.screens) ? r.screens : []);
    const history: Line[] = (r?.history ?? []).map((h: Line) => ({ role: h.role, text: h.text }));

    if (r && !r.onboarded) {
      setStage("onboarding-name");
      setLines([...history, { role: "assistant", text: "Hello — I'm Steve. I don't think we've met. What should I call you?" }]);
    } else {
      setStage("ask");
      setLines(
        history.length
          ? history
          : [{ role: "assistant", text: "Hello again. What can I help you with?" }]
      );
    }
  }

  /**
   * The button. The only thing in this component that changes anything.
   *
   * Sends back the SEALED proposal and nothing else — not the card the person
   * has been looking at, which is a copy for reading. Marks the line settled
   * first so a double-click can't act twice, and appends whatever the server
   * says happened as its own line, in his voice.
   */
  async function confirm(at: number) {
    const line = lines[at];
    if (!line?.sealed || line.settled) return;

    setLines((l) => l.map((x, i) => (i === at ? { ...x, settled: "…" } : x)));
    setBusy(true);
    const r = await fetch("/api/assistant/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sealed: line.sealed, thread: thread.current }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    const said = r?.message ?? r?.error ?? "That didn't go through. Try asking me again.";
    setLines((l) => [
      ...l.map((x, i) => (i === at ? { ...x, settled: r?.ok ? "done" : "failed" } : x)),
      { role: "assistant", text: said },
    ]);
  }

  async function say() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setLines((l) => [...l, { role: "agent", text }]);
    setBusy(true);
    setMood("thinking");

    const r = await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      /* Where they are and what they have open. Read at send time rather than
   held in state: the drawer can open and close between messages, and the
   only moment this needs to be true is now. */
        body: JSON.stringify({
          text,
          kind: stage,
          thread: thread.current,
          path,
          openListingId: getOpenListing(),
          /* Everything layered on screen, furthest back first. Read HERE and
             not held in state for the same reason as the listing id above:
             the only moment it needs to be true is the instant Send is
             pressed. */
          surfaces: getOpenSurfaces(),
        }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);

    const answer = r?.reply ?? "Something went wrong sending that. Try again in a moment.";
    setLines((l) => [
      ...l,
      {
        role: "assistant",
        text: answer,
        steps: Array.isArray(r?.steps) ? r.steps : undefined,
        card: r?.proposal,
        sealed: r?.sealed,
      },
    ]);
    setBusy(false);

    /* Thinking ends the moment he has something to say, and he says it —
       which is the whole reason the mouth animates. */
    setMood("talking");
    setTimeout(() => setMood("idle"), 1400);

    setStage(stage === "onboarding-name" ? "onboarding-help" : "ask");
  }

  /**
   * Wipe the screen, keep the record.
   *
   * The line is drawn server-side before the screen changes, not after. Doing
   * it the other way round gives an agent an empty panel and, if the request
   * failed, the whole thread back again on the next open — which reads as the
   * clear button not working rather than as a failed request, and gets pressed
   * again and again.
   *
   * He greets you afterwards rather than leaving a blank box, because an empty
   * panel with a cursor in it looks broken. No re-introduction though: being
   * onboarded is counted across all time, so clearing does not make him ask
   * your name again like you had never met.
   */
  async function clear() {
    if (busy) return;
    setBusy(true);
    const ok = await fetch("/api/assistant/ask", { method: "DELETE" })
      .then((r) => r.ok)
      .catch(() => false);
    setBusy(false);
    if (!ok) {
      setLines((l) => [
        ...l,
        { role: "assistant", text: "I couldn't clear that just now. Try again in a moment." },
      ]);
      return;
    }
    setLines([{ role: "assistant", text: "Cleared. What can I help you with?" }]);
    setStage("ask");
    /* So the next scroll is a jump rather than a crawl down a list of one. */
    landed.current = false;
    setCleared(true);
    setTimeout(() => setCleared(false), 1600);
  }

  async function sendFeedback() {
    setBusy(true);
    setMood("thinking");
    /* A picture of what they were looking at, taken before the report goes.
       James, 29 Aug: Susan hit a problem and the next thing that had to happen
       was "can you send me a screenshot?" — a round trip to learn something
       the browser already knew.

       Awaited rather than fired alongside, because the point is to catch the
       screen as it is NOW. It returns null on any failure and the report goes
       without it: somebody who has just hit a bug must not then hit a second
       one trying to tell us about the first. */
    const shot = await captureScreen();

    await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: fb,
        path,
        kind,
        shot,
        context: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ua: navigator.userAgent.slice(0, 160),
        },
      }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
    setFb("");
    setMood("happy");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMood("idle");
      rest();
    }, 2400);
  }

  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
      on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 text-muted hover:text-ink"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Steve — help and feedback"
        aria-label="Steve — help and feedback"
        aria-expanded={open}
        data-hide-from-shot
        data-os-steve
        className="fixed bottom-2 right-3 z-[190] text-ink transition-transform hover:scale-105 active:scale-95"
      >
        <AssistantCharacter mood={mood} size={76} loop={performing} />
      </button>

      {open && (
        <div
          /* Shifted left of the character so the tail lands on his head rather
             than beside it, and so the bubble does not sit directly over him. */
          data-hide-from-shot
          data-os-steve-bubble
          className="fade-up fixed bottom-[104px] right-[68px] z-[190] w-[min(340px,calc(100vw-2.5rem))]"
        >
          <div className="relative rounded-[22px] border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
            {/* The tail. Two stacked squares — the outer one carries the border
                colour, the inner one covers the join so the bubble's own edge
                does not run straight through it. */}
            <span className="absolute -bottom-[9px] right-9 h-4 w-4 rotate-45 border-b border-r border-line/80 bg-panel" />
            <span className="absolute -bottom-[1px] right-9 h-4 w-4 rotate-45 bg-panel" />

            <div className="relative">
              {/* Wraps, because three pills and Clear do not fit across a
                  340px bubble on a phone. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setTab("help")} className={pill(tab === "help")}>
                  Need help?
                </button>
                <button type="button" onClick={() => setTab("guides")} className={pill(tab === "guides")}>
                  Guides
                </button>
                <button
                  type="button"
                  onClick={() => setTab("feedback")}
                  data-os-feedback
                  className={pill(tab === "feedback")}
                >
                  Give feedback
                </button>
                {/* Only once there is something to clear, and never mid-answer.
                    Set apart from the tab pills rather than dressed as another
                    one: those switch what you are looking at, this changes
                    something. */}
                {tab === "help" && lines.length > 0 && !busy && (
                  <button
                    type="button"
                    onClick={clear}
                    title="Start this conversation again. Your questions are still kept."
                    className="ml-auto text-[11px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                  >
                    {cleared ? "Cleared" : "Clear"}
                  </button>
                )}
              </div>

              {tab === "help" ? (
                <>
                  <div
                    ref={scroller}
                    className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-0.5"
                  >
                    {lines.map((l, i) =>
                      l.role === "agent" ? (
                        <p
                          key={i}
                          className="ml-8 rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark"
                        >
                          {l.text}
                        </p>
                      ) : (
                        <div key={i}>
                          <AssistantSays text={l.text} screens={screens} />
                          {/* What he actually read. An assistant that quotes
                              a rent should be able to show where it came
                              from — and when he says he could not find
                              something, this is the difference between
                              "he looked" and "he could not be bothered". */}
                          {l.steps && l.steps.length > 0 && (
                            <p className="mt-1 pl-1 text-[10px] leading-relaxed text-muted">
                              {l.steps.join(" · ")}
                            </p>
                          )}
                          {/* THE CARD. Everything that is about to happen, in
                              full, before it happens — the recipient, the whole
                              text, and what pressing it will cause. A summary
                              here would defeat the point of asking. */}
                          {l.card && (
                            <div className="mt-2 rounded-xl border border-line bg-box/60 p-2.5">
                              <p className="text-[10px] uppercase tracking-[0.08em] text-muted">
                                {CARD_TITLE[l.card.kind] ?? "Ready"}
                                {l.card.address ? ` · ${l.card.address}` : ""}
                              </p>
                              {l.card.kind === "email" && (
                                <p className="mt-1 text-[11.5px]">
                                  To <span className="font-semibold">{l.card.toName}</span>{" "}
                                  <span className="text-muted">{l.card.toEmail}</span>
                                </p>
                              )}
                              {l.card.kind === "reminder" && l.card.startsAt && (
                                <p className="mt-1 text-[11.5px] text-muted">
                                  {new Date(l.card.startsAt).toLocaleString("en-GB", {
                                    weekday: "short", day: "numeric", month: "short",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              )}
                              {(l.card.subject || l.card.heading || l.card.title) && (
                                <p className="mt-1 text-[12px] font-semibold">
                                  {l.card.subject ?? l.card.heading ?? l.card.title}
                                </p>
                              )}
                              {(l.card.body || l.card.text) && (
                                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                                  {l.card.body ?? l.card.text}
                                </p>
                              )}
                              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                                {CARD_EFFECT[l.card.kind]}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirm(i)}
                                  disabled={Boolean(l.settled) || busy}
                                  className="rounded-lg bg-accent-dark px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
                                >
                                  {l.settled === "done"
                                    ? l.card.kind === "email"
                                      ? "Sent"
                                      : "Done"
                                    : l.settled === "failed"
                                      ? "Didn't go"
                                      : l.settled
                                        ? "…"
                                        : CARD_BUTTON[l.card.kind]}
                                </button>
                                {!l.settled && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLines((ls) =>
                                        ls.map((x, j) => (j === i ? { ...x, settled: "cancelled" } : x))
                                      )
                                    }
                                    className="text-[11.5px] text-muted underline underline-offset-2"
                                  >
                                    No thanks
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                    {busy && (
                      <p className="mr-6 rounded-2xl rounded-bl-md bg-box px-3 py-2 text-[12.5px] text-muted">
                        {/* He may be doing several lookups now, which takes
                            seconds rather than milliseconds. A bare ellipsis
                            for that long reads as a hang. */}
                        Having a look…
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") say();
                      }}
                      autoFocus
                      placeholder={
                        stage === "onboarding-name"
                          ? "Your name"
                          : stage === "onboarding-help"
                            ? "What you'd like a hand with"
                            : "Ask Steve anything…"
                      }
                      className="min-w-0 flex-1 rounded-lg border border-line/80 bg-box px-2.5 py-2 text-[12.5px]"
                    />
                    <button
                      type="button"
                      onClick={say}
                      disabled={busy || !draft.trim()}
                      className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                  {/* Says which of the two he currently is. Claiming to answer
                      when the key is missing, or claiming not to when it is
                      there, are both worse than the extra line of state. */}
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                    {live
                      ? "I answer from what the business has written down, and I'll say so when it isn't covered. Everything you ask goes to James either way."
                      : "I can't answer on my own just now — everything you ask goes to James, and the answers become the help centre."}
                  </p>
                </>
              ) : tab === "guides" ? (
                /**
                 * The shelf, before there is anything on it.
                 *
                 * James asked for the tab now and the guides later. An empty tab
                 * is a promise, so it says what it is for and what to do in the
                 * meantime rather than showing a spinner or a blank panel that
                 * reads as broken. It deliberately does not invent categories or
                 * dummy titles: a list of guides that do not open is worse than
                 * an honest empty shelf, and this whole assistant is built on
                 * not implying something works when it does not.
                 */
                <div className="mt-3">
                  <p className="text-[13.5px]">Guides are on their way</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                    Written walkthroughs and training you can read at your own pace, rather
                    than having to ask. Nothing is filed here yet.
                  </p>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                    Until then, ask me under{" "}
                    <button
                      type="button"
                      onClick={() => setTab("help")}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                    >
                      Need help?
                    </button>{" "}
                    - and what people ask is what gets written first, so it is worth asking.
                  </p>

                  {/* The one thing genuinely on the shelf. The tour tells people
                      they can pick it up again from here, so it has to be here:
                      a promise made during onboarding and not kept is the first
                      thing somebody learns about the product. */}
                  <div className="mt-4 border-t border-line/70 pt-3">
                    <p className="text-[12px] font-semibold">Showing you round</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      The walkthrough you were offered when you first signed in.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("os-tour"))
                      }
                      className="mt-2.5 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
                    >
                      Run it again
                    </button>
                  </div>
                </div>
              ) : sent ? (
                <p className="py-5 text-center text-[13px]">Thanks — that&apos;s logged.</p>
              ) : (
                <>
                  <p className="mt-3 text-[13.5px]">Tell us what happened</p>
                  <p className="mt-1 text-[11px] text-muted">
                    On {path}. We capture the page and your browser, so no need to describe them.
                  </p>
                  {/* Three kinds, not one. A pilot produces far more "confusing"
                      than "broken", and collapsing them means the most useful
                      signal — where people get lost — arrives disguised as a
                      defect and gets closed as "works as designed". */}
                  <div className="mt-3 flex gap-1.5">
                    {[
                      ["bug", "Broken"],
                      ["confusing", "Confusing"],
                      ["idea", "Idea"],
                    ].map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setKind(k)} className={pill(kind === k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={fb}
                    onChange={(e) => setFb(e.target.value)}
                    rows={4}
                    placeholder="What were you doing, and what happened?"
                    className="mt-3 w-full rounded-lg border border-line/80 bg-box p-2.5 text-[12.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !fb.trim()}
                      onClick={sendFeedback}
                      className="flex-1 rounded-lg bg-accent-dark py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {busy ? "Sending…" : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={toggle}
                      className="rounded-lg border border-line/80 px-3 py-2 text-[12px]"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
