import type { LogLine } from "@/lib/assistant-log";

/**
 * WHAT PEOPLE KEEP ASKING STEVE (James, 18 Sep 2026): "rather than giving us
 * all of the dialogue for the questions asked, we should look for trends ...
 * if a question gets asked more than once, then it should show on the
 * trending list", ranked, top five for now.
 *
 * The same question is rarely typed the same way twice. Measured on the live
 * log that day: "how can you help me", "hey, how can you help me" and "What
 * can you help me with as my assistant" are one question. So questions are
 * grouped by their MEANINGFUL words - the filler (how, can, you, the...)
 * dropped, the rest cut to a rough stem - and two questions are the same when
 * the shorter one's words are nearly all in the longer one's.
 *
 * Greetings and nudges ("hey", "hello", "what about now", "lets try again")
 * are not questions, and on that day they were a third of the log. They are
 * left out rather than allowed to trend.
 *
 * Pure: the admin route hands it the log.
 */

const FILLER = new Set(
  `a an the and or but if so to of in on at for with from by about as into is are was were be been being am do does did done doing
   have has had having can could would should will shall may might must i me my mine we us our you your yours he him his she her
   they them their it its this that these those there here what which who whom whose when where why how all any some no not
   just please thanks thank hey hi hello okay ok yes yeah yet now then than also really very still again get got let lets let's
   im i'm ive i've youre you're dont don't cant can't whats what's hows how's tell show give need want like know steve`.split(/\s+/)
);

/** Nudges, greetings and tests - never a question worth writing up. */
const NOT_A_QUESTION = /^(h(ey|i|ello|iya)( steve)?|what about now|lets? try( it)? again|test(ing)?|are you there|you there|i love you|thanks?( you)?|cheers|ok(ay)?)[\s!?.]*$/i;

/** Rough stem: enough that "listing" and "listings", "booked" and "book" meet. */
function stem(w: string): string {
  return w
    .replace(/'s$/, "")
    .replace(/(ing|ings)$/, "")
    .replace(/(ied|ies)$/, "y")
    .replace(/(ed|es|s)$/, "")
    .slice(0, 12);
}

export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FILLER.has(w))
      .map(stem)
      .filter((w) => w.length > 1)
  );
}

/**
 * Whether two questions are the same one. Nearly all of the shorter one's
 * words are in the longer one - AND the two are within about three times of
 * each other's length. Without the second rule "how can you help me" (one
 * meaningful word: help) swallowed "can you help me draft an email to book a
 * market appraisal", which is a different question entirely (live log,
 * 18 Sep 2026).
 */
function same(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size || small.size / big.size < 0.3) return false;
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size >= 0.75;
}

export type Trend = {
  /** The wording people used most, or the plainest one. */
  question: string;
  /** Every wording, most recent first, for the detail. */
  wordings: string[];
  times: number;
  people: number;
  lastAsked: string;
  /** He said it was not covered at least once. */
  notCovered: boolean;
};

const PASSED_ON = /passed (it |this |that )?(on )?to james|not covered|isn't covered|is not covered|nothing written/i;

/**
 * The trends, most asked first. Only groups asked MORE THAN ONCE count - a
 * question asked once is not a trend - and ties go to the one asked most
 * recently. `since` bounds the window; everything before it is ignored.
 */
export function trendsFrom(lines: LogLine[], opts: { since?: Date; top?: number } = {}): Trend[] {
  const since = opts.since?.getTime() ?? 0;
  const byThread = new Map<string, LogLine[]>();
  for (const l of lines) {
    const list = byThread.get(l.thread) ?? [];
    list.push(l);
    byThread.set(l.thread, list);
  }
  /* Each question with whether his reply passed it on. */
  const asked: { text: string; by: string; at: string; set: Set<string>; notCovered: boolean }[] = [];
  for (const list of byThread.values()) {
    const ordered = list.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    ordered.forEach((l, i) => {
      if (l.role !== "agent" || l.kind !== "ask") return;
      if (new Date(l.createdAt).getTime() < since) return;
      const text = l.text.trim();
      if (!text || NOT_A_QUESTION.test(text)) return;
      const set = words(text);
      if (!set.size) return;
      const reply = ordered.slice(i + 1).find((x) => x.role === "assistant");
      asked.push({ text, by: l.userEmail, at: l.createdAt, set, notCovered: Boolean(reply && PASSED_ON.test(reply.text)) });
    });
  }

  /* Greedy grouping, newest first: a question joins the first group with a
     member it is the same as - compared member by member, so a group cannot
     drift by collecting words. */
  type Group = { members: typeof asked };
  const groups: Group[] = [];
  for (const q of asked.sort((a, b) => (a.at < b.at ? 1 : -1))) {
    const g = groups.find((x) => x.members.some((m) => same(m.set, q.set)));
    if (g) g.members.push(q);
    else groups.push({ members: [q] });
  }

  return groups
    .filter((g) => g.members.length > 1)
    .map((g) => {
      const counts = new Map<string, number>();
      for (const m of g.members) {
        const k = m.text.replace(/\s+/g, " ");
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      /* The most-used wording; on a tie, the shortest reads best as a label. */
      const question = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      return {
        question,
        wordings: [...new Set(g.members.map((m) => m.text.replace(/\s+/g, " ")))],
        times: g.members.length,
        people: new Set(g.members.map((m) => m.by)).size,
        lastAsked: g.members[0].at,
        notCovered: g.members.some((m) => m.notCovered),
      };
    })
    .sort((a, b) => b.times - a.times || (a.lastAsked < b.lastAsked ? 1 : -1))
    .slice(0, opts.top ?? 5);
}
