"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";
import { captureScreen } from "@/lib/screenshot";
import AssistantSays, { type Screen } from "@/components/AssistantSays";
import DoodleIcon from "@/components/DoodleIcon";
import Segmented from "@/components/Segmented";
import { fillFrontCompose, getOpenListing, getOpenSurfaces } from "@/lib/open-record";
import { whenAgo } from "@/lib/lead-spine";

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
 * ── Four tabs, because it broadcasts as well as answers ───────────────────
 *
 * James, 10 Sep 2026: "we want to make this a bit more of a broadcast feature.
 * We obviously need help, guides, and the ability to give feedback, but I also
 * think the news could be a nice thing."
 *
 * Every one of the first three tabs is a way for an agent to PULL something out
 * of us. Nothing in the product could push, so "the OS does X now" reached
 * people by somebody sending an email, or not at all. News is the other
 * direction, and it is the reason the character in the corner can carry a red
 * dot: there is finally something for him to be carrying.
 *
 * ── The chat line is one control, not three ───────────────────────────────
 *
 * A pill with the attach button inside it on the left and the send button
 * inside it on the right, rather than a field with a button next to it. James
 * asked for "the actual chat function as a circle box with things on either
 * side" - and the shape is doing a job: it says that attaching a file and
 * sending a message are the same action, which is exactly right, because a
 * file with nothing typed IS a message and gets sent as one.
 *
 * ── What is deliberately NOT at the bottom any more ───────────────────────
 *
 * There used to be a paragraph under the input explaining where his answers
 * came from and that everything goes to James. It was true and it was in the
 * worst possible place: a permanent block of small print under the one control
 * somebody came here to use. Gone, on James's instruction. The one part that
 * could not simply be dropped - that he cannot answer on his own when there is
 * no key - is now said in his own voice, in the thread, where a person reads it
 * once instead of looking at it every time.
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

/**
 * Fidgets, before the phone comes out.
 *
 * James, 2 Sep: "occasionally get bored and maybe bounce a little bit on the
 * screen… just to make it feel a little bit more fleshed out."
 *
 * A minute of perfectly even hovering is a screensaver. So on the way to his
 * phone he gets bored twice and yawns once, each a few seconds long, at times
 * that are jittered so two agents side by side are not bouncing in step. The
 * order is fixed - bored, bored, yawn - because that IS the order: you fidget
 * before you stretch, and you stretch before you give up and get your phone
 * out. Every fidget returns him to idle on its own, and all of them live in the
 * same timer list as the phone and the nap, so opening him clears the lot.
 */
const FIDGETS: Array<{ mood: Mood; at: number; jitter: number; for: number }> = [
  { mood: "bored", at: 16_000, jitter: 6_000, for: 4_800 },
  { mood: "bored", at: 34_000, jitter: 6_000, for: 4_800 },
  { mood: "yawn", at: 50_000, jitter: 4_000, for: 2_400 },
];

/**
 * What the feedback form does to his face.
 *
 * The three pills are three feelings, and he wears whichever is selected for
 * as long as the form is open: sad that something is broken, puzzled that
 * something is confusing, lit up by an idea. Then after it is sent, a small
 * bow for the first two - somebody has just told us something went wrong, and
 * a hop and a sparkle would be the wrong note - and the hop for the third.
 */
const FEEDBACK_MOOD: Record<string, Mood> = { bug: "sad", confusing: "confused", idea: "idea" };
const SENT_MOOD: Record<string, Mood> = { bug: "nod", confusing: "nod", idea: "happy" };

/**
 * How he takes what was typed at him.
 *
 * Read on the client, off the words the person used, rather than asked of the
 * model - it needs to be instant, it costs nothing, and being wrong costs a
 * face that is briefly the wrong shape. Checked in this order because "thanks,
 * but it's still broken" is about the broken part.
 */
const SAID_BROKEN =
  /\b(broken|not working|doesn'?t work|isn'?t working|won'?t (load|work|open|save|send)|crash(ed|es|ing)?|error|bug|stuck|fail(ed|s|ing)?|gone wrong)\b/i;
const SAID_CONFUSED =
  /\b(confus(ed|ing)|don'?t understand|no idea|i'?m lost|makes no sense|unclear|can'?t (find|see|figure|work out|tell)|what does .* mean|what is this for)\b/i;
const SAID_THANKS =
  /\b(thanks?|thank you|thankyou|cheers|ta|nice one|brilliant|perfect|great|lovely|legend|star|much appreciated|that worked|sorted)\b/i;

function heard(text: string): Mood | null {
  if (SAID_BROKEN.test(text)) return "sad";
  if (SAID_CONFUSED.test(text)) return "confused";
  if (SAID_THANKS.test(text)) return "happy";
  return null;
}

type Tab = "help" | "guides" | "news" | "feedback";

/** The strip across the top. Ids are the tour's, and must not be renamed. */
const TABS: { id: Tab; label: string }[] = [
  { id: "help", label: "Chat" },
  { id: "guides", label: "Guides" },
  { id: "news", label: "News" },
  { id: "feedback", label: "Feedback" },
];

/**
 * Three questions to press instead of a blank box.
 *
 * Not decoration and not a menu: an empty input with a cursor in it asks
 * somebody to work out what this thing is capable of before they have used it
 * once, and most people answer that by closing the panel. Each of these is a
 * question he can genuinely answer from what is written down - a suggestion he
 * fails is worse than no suggestion.
 */
const OPENERS: { icon: string; text: string }[] = [
  { icon: "home", text: "How do I put a property on the market?" },
  { icon: "checklist", text: "Where do I find my applications?" },
  { icon: "shield", text: "What certificates does a home need?" },
];

/** A file on its way up, or already there. */
type Attached = {
  name: string;
  size: number;
  type: string;
  /** Set once it is in the bucket. Absent while uploading or if it failed. */
  key?: string;
  error?: string;
};

/** What the office has published, and what the industry is saying. */
type Post = {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  link: string;
  author: string;
  publishedAt: string;
};
type Headline = { title: string; link: string; at: string | null; blurb: string };

const POST_BADGE: Record<string, string> = {
  announcement: "Announcement",
  release: "New in the OS",
  reminder: "Reminder",
};

/** The newest post this browser has already been shown. See NEWS_SEEN below. */
const NEWS_SEEN = "os-news-seen";

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
  /** Files that went up with this message. Only ever on an agent's line. */
  files?: Attached[];
};

/** Mirrors ActionProposal server-side, narrowed to what the card draws. */
type Proposal = {
  kind: "note" | "reminder" | "write-up" | "email" | "fill-compose";
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
  /* Never actually drawn — a fill-compose is applied on arrival and its card
     suppressed, because the result is visible in the boxes themselves. Present
     so the Record stays exhaustive and a new kind cannot be added without
     deciding what its card says. */
  "fill-compose": "Typed into your email",
  note: "Note, ready to save",
  reminder: "Reminder, ready to set",
  "write-up": "New advert, ready to publish",
  email: "Email, ready to send",
};
const CARD_BUTTON: Record<Proposal["kind"], string> = {
  "fill-compose": "Type it in",
  note: "Save note",
  reminder: "Set reminder",
  "write-up": "Publish it",
  email: "Send it",
};
/* The consequence, spelled out. Somebody pressing a button in a chat bubble
   deserves to know it reaches Rightmove. */
const CARD_EFFECT: Record<Proposal["kind"], string> = {
  "fill-compose": "Puts the text in the boxes on your screen. Nothing is sent - that is still your button.",
  note: "Saves to the property file in the OS. Not sent to REX.",
  reminder: "Goes in the OS diary only - not REX, not your 365 calendar.",
  "write-up": "Writes to REX and goes live on Rightmove, Zoopla and OnTheMarket in about five to ten minutes.",
  email: "Sends from YOUR Microsoft mailbox, so it is in your Sent Items and their reply threads onto it. BCC'd to REX so it shows on their timeline. The address is looked up again when you press - it always goes to the person on the record.",
};

export default function HelpDock() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("help");
  /* The shelf: every guide, built or written - see /api/knowledge/guides. Read
     when the tab is opened, so the panel costs nothing on screens where nobody
     looks at it. */
  const [shelf, setShelf] = useState<
    { id: string; title: string; section: string; blurb: string; minutes: number; href: string; form: string }[] | null
  >(null);
  useEffect(() => {
    if (tab !== "guides" || shelf !== null) return;
    fetch("/api/knowledge/guides", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { guides?: typeof shelf } | null) => setShelf(j?.guides ?? []))
      .catch(() => setShelf([]));
  }, [tab, shelf]);

  /* ── The newsroom ─────────────────────────────────────────────────────────
     Two lists, deliberately not merged: what the office published, then what
     the industry is saying. An agent has to be able to tell a change to their
     own system from a headline about somebody else's business, and one blended
     feed takes that away. */
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [headlines, setHeadlines] = useState<Headline[] | null>(null);
  useEffect(() => {
    if (tab !== "news" || headlines !== null) return;
    fetch("/api/news", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: Headline[] } | null) => setHeadlines(j?.items?.slice(0, 4) ?? []))
      .catch(() => setHeadlines([]));
  }, [tab, headlines]);

  /**
   * The red dot, and why it is in localStorage.
   *
   * "Seen" is per BROWSER rather than per person on the server. That is a real
   * limitation - James on his phone gets the dot again after clearing it on his
   * laptop - and it is the right trade for this particular thing. The
   * alternative is a preference row per user per read, which means the dot
   * cannot work at all on a machine with no database, which means the tab
   * cannot be driven before it ships. A notification dot is not a figure;
   * being briefly wrong about one costs nobody anything.
   */
  const [unseen, setUnseen] = useState(0);
  const markSeen = useCallback((list: Post[]) => {
    const newest = list.reduce((a, p) => (p.publishedAt > a ? p.publishedAt : a), "");
    if (newest) {
      try {
        window.localStorage.setItem(NEWS_SEEN, newest);
      } catch {
        /* Private browsing. The dot simply comes back, which is the harmless
           end of getting this wrong. */
      }
    }
    setUnseen(0);
  }, []);

  const [lines, setLines] = useState<Line[]>([]);
  const [stage, setStage] = useState<"ask" | "onboarding-name" | "onboarding-help">("ask");
  const [draft, setDraft] = useState("");
  /* Files chosen for the message being written. Cleared when it is sent. */
  const [files, setFiles] = useState<Attached[]>([]);
  const picker = useRef<HTMLInputElement | null>(null);
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

  /**
   * The board, read once the moment we know somebody is there.
   *
   * On mount rather than when the tab is opened, because the whole point of the
   * dot is that it appears BEFORE anybody opens anything. One small request per
   * full page load - the shell survives client navigation, so this does not run
   * again as somebody moves round the OS.
   */
  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/news/posts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { posts?: Post[] } | null) => {
        const list = j?.posts ?? [];
        setPosts(list);
        let seen = "";
        try {
          seen = window.localStorage.getItem(NEWS_SEEN) ?? "";
        } catch {
          /* Nothing readable means everything is new, which is the safe way
             round for a first visit and harmless for any other. */
        }
        setUnseen(list.filter((p) => p.publishedAt > seen).length);
      })
      .catch(() => setPosts([]));
  }, [signedIn]);

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
    for (const f of FIDGETS) {
      const at = f.at + Math.random() * f.jitter;
      timers.current.push(setTimeout(() => setMood(f.mood), at));
      timers.current.push(setTimeout(() => setMood("idle"), at + f.for));
    }
  }, []);

  useEffect(() => {
    if (!signedIn || open) return;
    rest();
    return () => timers.current.forEach(clearTimeout);
  }, [signedIn, open, rest]);

  /**
   * The face he goes back to when nothing else is happening.
   *
   * Idle, except on the feedback form, where the selected pill is what he
   * feels for as long as the form is open. Kept in a ref rather than derived
   * at each call site, so the moment a reaction ends it can ask "what should I
   * look like now?" and get the answer for the tab the person is on NOW, not
   * the one they were on when the reaction started.
   */
  const resting = useRef<Mood>("idle");
  useEffect(() => {
    const next: Mood = open && tab === "feedback" && !sent ? (FEEDBACK_MOOD[kind] ?? "idle") : "idle";
    const was = resting.current;
    resting.current = next;
    if (next !== "idle") setMood(next);
    /* Leaving the tab takes the feeling off his face. Sending the form does
       not go through here - sendFeedback puts its own reaction on and it must
       not be wiped by the form emptying underneath it. */
    else if (was !== "idle" && !sent) setMood("idle");
  }, [open, tab, kind, sent]);
  const settle = useCallback(() => setMood(resting.current), []);

  /* Looking at the news is what counts as having seen it. Not opening the
     panel - somebody who opens Chat has not read anything. */
  useEffect(() => {
    if (open && tab === "news" && posts) markSeen(posts);
  }, [open, tab, posts, markSeen]);

  /**
   * A reaction: a mood held for a moment, then back to rest.
   *
   * One timer, replaced each time, so a second reaction landing before the
   * first has finished does not leave a stale "back to rest" waiting to cut
   * the new one short.
   */
  const reacting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const react = useCallback((m: Mood, ms: number) => {
    if (reacting.current) clearTimeout(reacting.current);
    setMood(m);
    reacting.current = setTimeout(settle, ms);
  }, [settle]);

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
        tab?: Tab;
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
    /* Caught mid-bounce or mid-yawn counts as caught out too. */
    const waking = mood === "asleep" || mood === "texting" || mood === "bored" || mood === "yawn";
    react(waking ? "surprised" : "wave", waking ? 2600 : 1800);

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

  /**
   * Taking a file in.
   *
   * Straight up to the bucket as it is chosen, not held until Send. Two
   * reasons, and the second is the important one: a 6MB photograph from a
   * phone takes a few seconds, and doing that after the person has pressed
   * Send means Send appears to hang; and a file that is going to be refused -
   * wrong type, too big, storage not configured on this environment - should
   * say so while they are still looking at it, not swallow their question.
   *
   * The chip shows the file with a spinner, then without, then with the reason
   * if it failed. Nothing about the message is blocked by a failed upload: the
   * question still sends, with whatever did arrive.
   */
  async function attach(chosen: FileList | null) {
    if (!chosen?.length) return;
    /* Four is the cap the server enforces too. This is a question, not a
       submission. */
    const room = Math.max(0, 4 - files.length);
    const list = Array.from(chosen).slice(0, room);
    if (!list.length) return;

    const at = files.length;
    setFiles((f) => [...f, ...list.map((x) => ({ name: x.name, size: x.size, type: x.type }))]);

    await Promise.all(
      list.map(async (file, i) => {
        const form = new FormData();
        form.append("file", file);
        form.append("scope", "support");
        /* Keyed by the conversation, so everything one person sent while
           asking one thing sits under one prefix. */
        form.append("ref", `steve-${thread.current}`);
        const r = await fetch("/api/r2/upload", { method: "POST", body: form })
          .then((x) => x.json())
          .catch(() => null);
        setFiles((f) =>
          f.map((x, j) =>
            j === at + i
              ? r?.ok
                ? { ...x, key: r.key as string }
                : { ...x, error: (r?.error as string) ?? "That didn't upload." }
              : x
          )
        );
      })
    );
  }

  /** `override` is a suggestion being pressed: sent as typed, without a
   *  round trip through the input's state. */
  async function say(override?: string) {
    const text = (override ?? draft).trim();
    /* Sent, and only sent, once every chosen file has finished one way or the
       other. Otherwise a key that arrives a moment later is attached to
       nothing. */
    const uploading = files.some((f) => !f.key && !f.error);
    const sending = files.filter((f) => f.key);
    if ((!text && !sending.length) || busy || uploading) return;
    setDraft("");
    setFiles([]);
    setLines((l) => [...l, { role: "agent", text, files: sending }]);
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
          /* Keys only. The file itself went up on its own, through the one
             route that decides what may be stored. */
          attachments: sending.map((f) => ({ key: f.key, name: f.name, type: f.type, size: f.size })),
        }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);

    /* ── Type it in, right now ────────────────────────────────────────────

       Applied on arrival rather than behind a "Do it" button, and that is a
       considered difference from every other proposal. The others WRITE
       something — a note onto a record, a reminder into a diary — so they wait
       for a press. This one only puts text in two boxes on a screen the person
       is looking at, next to a send button they still have to press
       themselves. Making them confirm before their own draft appears would be
       ceremony around the safest thing here.

       Its card is suppressed for the same reason: the result IS the composer,
       and showing a copy of the text underneath the chat is the paste-it-
       yourself behaviour this replaces. If nothing was filled — the composer
       closed while he was writing — the card falls back so the work is not
       lost. */
    let filled = false;
    if (r?.proposal?.kind === "fill-compose") {
      filled = fillFrontCompose({ subject: r.proposal.subject, body: r.proposal.body });
    }

    let answer = r?.reply ?? "Something went wrong sending that. Try again in a moment.";
    if (r?.proposal?.kind === "fill-compose" && !filled) {
      /* The composer closed while he was writing. The draft is real work and
         must not evaporate, so it falls back to the behaviour this replaced:
         in the chat, ready to copy, with the reason it is there. */
      answer +=
        `\n\nYour email closed before I could type it in, so here it is:` +
        `\n\nSubject: ${r.proposal.subject ?? ""}\n\n${r.proposal.body ?? ""}`;
    }
    setLines((l) => [
      ...l,
      {
        role: "assistant",
        text: answer,
        steps: Array.isArray(r?.steps) ? r.steps : undefined,
        /* Never a card for a fill-compose. When it worked the result IS the
           composer, and drawing a copy of the text underneath the chat is the
           copy-it-yourself behaviour this exists to replace; when it failed the
           draft is in the answer above instead. */
        card: r?.proposal?.kind === "fill-compose" ? undefined : r?.proposal,
        sealed: r?.sealed,
      },
    ]);
    setBusy(false);

    /* Thinking ends the moment he has something to say, and he says it —
       which is the whole reason the mouth animates. Unless what was said to
       him deserves a face first: a thank-you gets the hop, a "this is broken"
       gets the droop, a "this makes no sense" gets the head-scratch. The
       reply is on screen either way; the face is the acknowledgement. */
    const felt = text ? heard(text) : null;
    if (felt) react(felt, 2800);
    else react("talking", 1400);

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
    /* A bow for a bug or a confusion, the hop for an idea - see SENT_MOOD. */
    setMood(SENT_MOOD[kind] ?? "happy");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMood("idle");
      rest();
    }, 2400);
  }

  /** A file size somebody can read, rather than bytes. */
  const weigh = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

  const uploading = files.some((f) => !f.key && !f.error);
  const canSend = !busy && !uploading && (Boolean(draft.trim()) || files.some((f) => f.key));

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Steve — help, guides and news"
        aria-label="Steve — help, guides and news"
        aria-expanded={open}
        data-hide-from-shot
        data-os-steve
        className="fixed bottom-2 right-3 z-[190] text-ink transition-transform hover:scale-105 active:scale-95"
      >
        <AssistantCharacter mood={mood} size={76} loop={performing} />
        {/* Something to carry. The dot is only ever there because there is
            genuinely something unread — see the note on `unseen`. */}
        {unseen > 0 && !open && (
          <span
            aria-hidden
            className="absolute right-2 top-3 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-dark px-1 text-[10.5px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
          >
            {unseen}
          </span>
        )}
        <span className="sr-only">{unseen > 0 ? `${unseen} unread` : ""}</span>
      </button>

      {open && (
        <div
          /* Shifted left of the character so the tail lands on his head rather
             than beside it, and so the bubble does not sit directly over him. */
          data-hide-from-shot
          data-os-steve-bubble
          className="fade-up fixed bottom-[104px] right-[68px] z-[190] w-[min(392px,calc(100vw-2.5rem))]"
        >
          <div className="relative rounded-[22px] border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
            {/* The tail. Two stacked squares — the outer one carries the border
                colour, the inner one covers the join so the bubble's own edge
                does not run straight through it. */}
            <span className="absolute -bottom-[9px] right-9 h-4 w-4 rotate-45 border-b border-r border-line/80 bg-panel" />
            <span className="absolute -bottom-[1px] right-9 h-4 w-4 rotate-45 bg-panel" />

            <div className="relative">
              {/* Who this is, and the two things that are not a tab: clearing
                  the chat, and closing. Set apart from the strip below rather
                  than dressed as more of it — those switch what you are looking
                  at, these change something. */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">Steve</p>
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
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Close"
                  className={`${tab === "help" && lines.length > 0 && !busy ? "" : "ml-auto"} grid h-6 w-6 place-items-center rounded-full text-muted transition-colors hover:bg-box hover:text-ink`}
                >
                  <DoodleIcon name="cross" size={9} />
                </button>
              </div>

              {/* The strip. The same sliding control as every other choice of
                  three or four in the OS — a marker that travels rather than an
                  accent that blinks from one pill to the next. */}
              <Segmented
                className="mt-2 w-full"
                options={TABS}
                value={tab}
                onChange={(t) => setTab(t)}
              />

              {tab === "help" ? (
                <>
                  <div
                    ref={scroller}
                    className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-0.5"
                  >
                    {/* What he is, said once, in the thread. This used to be a
                        permanent block under the input; it only ever needed to
                        be said when it is true. */}
                    {!live && (
                      <p className="rounded-xl border border-line/70 bg-box/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
                        I can&apos;t answer on my own just now. Everything you ask goes to James, and
                        the answers become the guides.
                      </p>
                    )}
                    {lines.map((l, i) =>
                      l.role === "agent" ? (
                        <div key={i} className="ml-8">
                          {l.text && (
                            <p className="rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark">
                              {l.text}
                            </p>
                          )}
                          {/* What they sent, still openable afterwards. A file
                              that vanishes the moment it is sent leaves nobody
                              able to check what actually went. */}
                          {l.files && l.files.length > 0 && (
                            <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                              {l.files.map((f) => (
                                <a
                                  key={f.key}
                                  href={`/api/r2/file?key=${encodeURIComponent(f.key ?? "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex max-w-full items-center gap-1.5 rounded-full border border-accent-dark/30 bg-accent-soft/60 px-2.5 py-1 text-[10.5px] text-accent-dark transition-colors hover:border-accent-dark"
                                >
                                  <DoodleIcon name="doc" size={11} />
                                  <span className="truncate">{f.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
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

                    {/* Three things to press, until somebody has asked
                        something of their own. They go the moment the
                        conversation is real. */}
                    {stage === "ask" && lines.length <= 1 && !busy && (
                      <div className="space-y-1.5 pt-1">
                        {OPENERS.map((o) => (
                          <button
                            key={o.text}
                            type="button"
                            onClick={() => say(o.text)}
                            className="flex w-full items-center gap-2.5 rounded-full border border-line/80 bg-box/70 px-3 py-2 text-left text-[11.5px] transition-colors hover:border-accent-dark/50 hover:bg-accent-soft/40"
                          >
                            <DoodleIcon name={o.icon} size={13} className="text-accent-dark" />
                            <span className="min-w-0 flex-1">{o.text}</span>
                            <span aria-hidden className="text-[9px] text-muted">›</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chosen files, above the line they will go with.
                      A file that arrived is a pill. A file that was REFUSED is
                      not: it takes the full width and puts the reason on its
                      own line underneath. Squeezed into a pill beside a
                      sentence like "storage isn't configured on this
                      environment", the name truncates to "Gas saf…" - and
                      which file failed is the one thing the person needs to
                      know. */}
                  {files.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {files.map((f, i) =>
                        f.error ? (
                          <div
                            key={`${f.name}-${i}`}
                            className="flex w-full items-start gap-1.5 rounded-xl border border-red-400/50 bg-red-500/[0.07] px-2.5 py-1.5 text-[10.5px] text-red-600 dark:text-red-400"
                          >
                            <DoodleIcon name="info" size={11} className="mt-[1px] shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block break-words font-semibold">{f.name}</span>
                              <span className="mt-0.5 block leading-relaxed opacity-90">{f.error}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                              aria-label={`Remove ${f.name}`}
                              className="mt-[1px] shrink-0 transition-colors hover:text-ink"
                            >
                              <DoodleIcon name="cross" size={8} />
                            </button>
                          </div>
                        ) : (
                          <span
                            key={`${f.name}-${i}`}
                            className="flex max-w-full items-center gap-1.5 rounded-full border border-line/80 bg-box px-2.5 py-1 text-[10.5px] text-muted"
                          >
                            <DoodleIcon name="doc" size={11} className="shrink-0" />
                            <span className="truncate">{f.name}</span>
                            <span className="shrink-0 opacity-70">{f.key ? weigh(f.size) : "sending…"}</span>
                            <button
                              type="button"
                              onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                              aria-label={`Remove ${f.name}`}
                              className="shrink-0 transition-colors hover:text-ink"
                            >
                              <DoodleIcon name="cross" size={8} />
                            </button>
                          </span>
                        )
                      )}
                    </div>
                  )}

                  {/* ── The line ────────────────────────────────────────────
                      One control: attach on the left, send on the right, both
                      inside the pill. The border lives on the pill, so the
                      whole thing lights up together when you type in it. */}
                  <div className="mt-2.5 flex items-center gap-1 rounded-full border border-line/80 bg-box p-1 transition-colors focus-within:border-ink">
                    <input
                      ref={picker}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        attach(e.target.files);
                        /* Reset, so choosing the same file twice in a row
                           fires a change event the second time. */
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => picker.current?.click()}
                      disabled={stage !== "ask" || files.length >= 4}
                      title={
                        files.length >= 4
                          ? "Four files is the limit for one question"
                          : "Attach a document or a photograph"
                      }
                      aria-label="Attach a file"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <DoodleIcon name="upload" size={14} />
                    </button>
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
                      /* pr-2 so a long question does not run right up under
                         the send button as it scrolls. */
                      className="min-w-0 flex-1 bg-transparent pl-1 pr-2 text-[12.5px] outline-none placeholder:text-muted"
                    />
                    <button
                      type="button"
                      onClick={() => say()}
                      disabled={!canSend}
                      aria-label="Send"
                      title={uploading ? "Waiting for the file" : "Send"}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-dark text-white transition-opacity disabled:opacity-30"
                    >
                      {/* Drawn rather than an icon file: it is a 10px arrow and
                          the set has no arrow in it. */}
                      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                        <path
                          d="M6 10.5V2M6 2 2.5 5.5M6 2l3.5 3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              ) : tab === "guides" ? (
                /**
                 * The shelf.
                 *
                 * Both kinds of guide, in one list: the built walkthroughs and
                 * anything the office has typed into /knowledge and ticked. It
                 * deliberately does not invent categories or dummy titles — a
                 * list of guides that do not open is worse than an honest empty
                 * shelf, and this whole assistant is built on not implying
                 * something works when it does not.
                 */
                <div className="mt-3">
                  {shelf && shelf.length > 0 ? (
                    <>
                      <p className="text-[12px] leading-relaxed text-muted">
                        Written by the office, to read at your own pace.
                      </p>
                      <ul className="mt-2.5 max-h-[46vh] space-y-1.5 overflow-y-auto pr-0.5">
                        {shelf.map((g) => (
                          <li key={`${g.form}-${g.id}`}>
                            <a
                              href={g.href}
                              className="block rounded-xl border border-line/80 bg-box/50 px-3 py-2.5 transition-colors hover:border-accent-dark/50 hover:bg-accent-soft/30"
                            >
                              <span className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{g.title}</span>
                                <span className="shrink-0 text-[10px] text-muted">{g.minutes} min</span>
                              </span>
                              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.07em] text-muted">
                                {g.section} · {g.form === "walkthrough" ? "Walkthrough" : "Written"}
                              </span>
                              {g.blurb && (
                                <span className="mt-1 block text-[11.5px] leading-snug text-muted">{g.blurb}</span>
                              )}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="text-[13.5px]">
                        {shelf === null ? "Reading the shelf…" : "Guides are on their way"}
                      </p>
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
                          Chat
                        </button>{" "}
                        - and what people ask is what gets written first, so it is worth asking.
                      </p>
                    </>
                  )}

                  {/* The tour tells people they can pick it up again from here,
                      so it has to be here: a promise made during onboarding and
                      not kept is the first thing somebody learns about the
                      product. */}
                  <div className="mt-3.5 border-t border-line/70 pt-3">
                    <p className="text-[12px] font-semibold">Showing you round</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      The walkthrough you were offered when you first signed in.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent("os-tour"))}
                      className="mt-2.5 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
                    >
                      Run it again
                    </button>
                  </div>
                </div>
              ) : tab === "news" ? (
                /**
                 * The board.
                 *
                 * Us first, then the industry, under their own headings. See the
                 * note by `posts` for why they are not one list.
                 */
                <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-0.5">
                  {posts === null ? (
                    <p className="text-[12px] text-muted">Reading the board…</p>
                  ) : posts.length === 0 ? (
                    <p className="text-[12px] leading-relaxed text-muted">
                      Nothing from the office just now. Changes to the OS, and anything everybody
                      needs to know, land here.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {posts.map((p) => (
                        <li
                          key={p.id}
                          className={`rounded-xl border bg-box/50 p-3 ${
                            p.pinned ? "border-accent-dark/45" : "border-line/80"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-accent-dark">
                              {POST_BADGE[p.kind] ?? "Announcement"}
                            </span>
                            {p.pinned && <DoodleIcon name="star" size={11} className="text-accent-dark" />}
                            <span className="ml-auto shrink-0 text-[10px] text-muted">
                              {whenAgo(p.publishedAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[12.5px] font-semibold leading-snug">{p.title}</p>
                          {p.body && (
                            <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                              {p.body}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-3">
                            {p.link && (
                              <a
                                href={p.link}
                                className="text-[11px] font-semibold text-accent-dark underline decoration-accent-dark/40 underline-offset-2"
                              >
                                Take a look
                              </a>
                            )}
                            {p.author && <span className="text-[10px] text-muted">{p.author}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="border-t border-line/70 pt-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <DoodleIcon name="megaphone" size={12} />
                      From the industry
                    </p>
                    {headlines === null ? (
                      <p className="mt-2 text-[11.5px] text-muted">Reading the feed…</p>
                    ) : headlines.length === 0 ? (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                        The feed didn&apos;t answer just now.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-line/60">
                        {headlines.map((h) => (
                          <li key={h.link}>
                            <a
                              href={h.link}
                              target="_blank"
                              rel="noreferrer"
                              className="block py-2 transition-colors hover:text-accent-dark"
                            >
                              <span className="block text-[11.5px] font-semibold leading-snug">{h.title}</span>
                              <span className="mt-0.5 block text-[10px] text-muted">
                                Landlord Today{h.at ? ` · ${whenAgo(h.at)}` : ""}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
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
                      defect and gets closed as "works as designed".

                      The same sliding control as the tabs above: a choice of
                      three is a choice of three wherever it appears. */}
                  <Segmented
                    className="mt-3 w-full"
                    options={[
                      { id: "bug", label: "Broken" },
                      { id: "confusing", label: "Confusing" },
                      { id: "idea", label: "Idea" },
                    ]}
                    value={kind}
                    onChange={setKind}
                  />
                  <textarea
                    value={fb}
                    onChange={(e) => setFb(e.target.value)}
                    rows={4}
                    placeholder="What were you doing, and what happened?"
                    className="mt-3 w-full rounded-2xl border border-line/80 bg-box p-3 text-[12.5px] outline-none transition-colors focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={busy || !fb.trim()}
                    onClick={sendFeedback}
                    className="mt-2 w-full rounded-full bg-accent-dark py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    {busy ? "Sending…" : "Send it"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
