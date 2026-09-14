/**
 * The last few things somebody did before it broke.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James, 13 Sep 2026: when an agent hits an error the report has to arrive
 * with everything the browser already knew - the route, the person, the
 * stack, a picture, and what they were doing. The first four are easy. The
 * fifth is this: a short list of the last steps, so "it crashed" becomes "it
 * crashed on the second click of Book a viewing, right after the listings
 * call took nine seconds".
 *
 * ── Why sessionStorage rather than a variable ─────────────────────────────
 *
 * A crash inside the root layout takes the whole React tree down and Next
 * mounts global-error in its place. Anything held in memory goes with it.
 * sessionStorage survives that, survives a reload, and is per tab, which is
 * exactly the scope of "what this person was doing just now".
 *
 * ── What it is not ────────────────────────────────────────────────────────
 *
 * Not analytics. Nothing leaves the browser unless a report is filed, there
 * is no endpoint behind it, and it holds the last 14 lines and no more. It
 * records the words on the control somebody clicked, which on our screens can
 * be a person's name - the same information a screenshot of that screen
 * already carries, going to the same place and swept on the same clock.
 */

const KEY = "tle-trail";
const KEEP = 14;
/** Longer than this and it is a sentence, not a label. */
const CUT = 64;

export interface TrailLine {
  /** Milliseconds since the epoch, so the report can show the gaps. */
  at: number;
  /** went: a page. did: a click. slow / failed: a call that misbehaved. */
  kind: "went" | "did" | "slow" | "failed";
  text: string;
}

function read(): TrailLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as TrailLine[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    /* Private windows, storage turned off, a half-written value. A trail is a
       nicety; nothing above it may fail because it could not be read. */
    return [];
  }
}

/** Add a line. Never throws, and never matters enough to. */
export function note(kind: TrailLine["kind"], text: string): void {
  if (typeof window === "undefined") return;
  const clean = String(text).replace(/\s+/g, " ").trim().slice(0, CUT);
  if (!clean) return;
  try {
    const list = read();
    const last = list[list.length - 1];
    /* The same click twice in a row is one line with a count, so a person
       jabbing at a button that does nothing does not fill the whole trail -
       and "x3" is itself the symptom worth seeing. */
    if (last && last.kind === kind && last.text.replace(/ x\d+$/, "") === clean) {
      const n = Number(/ x(\d+)$/.exec(last.text)?.[1] ?? 1) + 1;
      last.text = `${clean} x${n}`;
      last.at = Date.now();
      list[list.length - 1] = last;
    } else {
      list.push({ at: Date.now(), kind, text: clean });
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    /* See read(). */
  }
}

/** The trail, oldest first. */
export function trail(): TrailLine[] {
  return read();
}

const WORD: Record<TrailLine["kind"], string> = {
  went: "opened",
  did: "clicked",
  slow: "slow:",
  failed: "failed:",
};

/**
 * The trail as something a person reads in a report, newest last, with the
 * gap between each step. Empty string when there is nothing to say, so the
 * caller can leave the whole section out.
 */
export function trailAsText(): string {
  const list = read();
  if (!list.length) return "";
  const end = list[list.length - 1].at;
  return list
    .map((l) => {
      const ago = Math.round((end - l.at) / 1000);
      const when = ago <= 0 ? "just then" : ago < 60 ? `${ago}s before` : `${Math.round(ago / 60)}m before`;
      return `- ${when}: ${WORD[l.kind]} ${l.text}`;
    })
    .join("\n");
}
