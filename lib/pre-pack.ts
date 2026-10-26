import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { icsFor } from "@/lib/appraisal-email";
import { hasDb, q } from "@/lib/db";
import { firstNameOf, type PresentDeck } from "@/lib/present";
import { DEFAULT_PACK_QUESTIONS, PRE_PACK_QUESTIONS_PREF, readSetting, type PackQuestion, type PackQuestionsSetting } from "@/lib/pre-pack-questions";

/**
 * THE PRE-APPRAISAL PACK (Claude Design, 23 Oct 2026).
 *
 * James's seven-slide pack, kept as the design's own page (lib/decks/
 * pre-appraisal-pack.html) so it looks exactly as he signed it off, filled
 * here from the deck the agent sent. The page reads one object, `window.D`;
 * this builds it.
 *
 * Every value is the deck's own (the landlord, the home, the booked visit,
 * the agent and their welcome video) apart from the company's fixed words:
 * the plan for the visit, the six things worth having ready and the arrival
 * notes. The quick questions are the agent's own (lib/pre-pack-questions,
 * 26 Oct 2026), and an agent can leave that slide out altogether. Nothing is invented: a deck with no
 * video shows the agent's photo, a deck with no note gets the company's
 * first-person welcome, and there is no shareable video link because we
 * have no such thing, so there is no Copy button.
 */

export type PackData = {
  /** The presentation token: for the answers and the open count. Null on the sample. */
  token: string | null;
  /** Staff opening their own pack: the headshot can be dragged and saved (app/api/present/frame). */
  frame: boolean;
  /** Slide 2's style. James chose "headshot" on 23 Oct 2026: the headshot always in the big box, the video behind Watch my video. "video" (the video in the box) is kept for the record. */
  meet: "video" | "headshot";
  /** The calendar file for Add to calendar. Null hides the button. */
  ics: string | null;
  landlord: { first: string; full: string };
  property: { street: string; area: string; town: string; postcode: string; type: string; beds: number | null };
  visit: { weekday: string; day: string; month: string; year: string; start: string; end: string; minutes: number; sent: string };
  agent: {
    first: string;
    name: string;
    role: string;
    initials: string;
    phone: string;
    email: string;
    photo: string;
    /** The headshot moved down in its box, percent of the box. */
    photoY: number;
    note: string;
    video: { length: string; link: string | null; src: string } | null;
  };
  plan: [string, number, string][];
  ready: [string, string, string][];
  /** The agent's own quick questions. Empty = they've switched the slide off, and the pack leaves it out. */
  questions: [string, string[]][];
  arrive: string[];
};

/* ── The company's words (the design's, as James signed them off) ── */

/** The visit in four parts. The minutes are the design's for a 45-minute visit; packPlan stretches them to the booking. */
const PLAN: [string, number, string][] = [
  ["Show me round", 15, "Room by room. I’ll take a few notes and measurements."],
  ["Your questions", 10, "Anything at all: rent, tenants, timings, the rules."],
  ["The local market", 10, "What’s letting nearby, and who’s looking."],
  ["What happens next", 10, "Your figure, and the steps if you want to go ahead."],
];

const READY: [string, string, string][] = [
  ["doc", "Gas safety certificate", "If you have one. We can book it if not."],
  ["leaf", "Energy certificate (EPC)", "We can look it up from the address."],
  ["bolt", "Electrical report (EICR)", "Only if it’s been done recently."],
  ["key", "Keys to every room", "Including the loft and any outbuildings."],
  ["pass", "Photo ID", "A passport or driving licence. A photo on your phone is fine."],
  ["home", "Proof you own it", "A mortgage statement or the title deeds."],
];

/* The quick questions are each agent's own now (26 Oct 2026 team call): the
   defaults, and the comment about pets, live in lib/pre-pack-questions. */

/* The design's first line promised on-street parking at every home, which a
   city flat can't have; this one is true everywhere. */
const ARRIVE = [
  "Tell me if parking is tricky and I’ll plan around it",
  "I’ll text you when I’m ten minutes away",
  "I’ll bring everything I need, including a tape measure",
];

/* When the agent hasn't written their own note. The design's sample claimed
   years in the area; this keeps its voice and claims nothing. */
const NOTE = "Thanks for booking in. I’ll walk round with you, take a few notes and talk through what your home could let for. Nothing to prepare, just show me round and ask me anything.";

/** The plan's minutes stretched to the booked visit, in fives, adding up exactly. */
export function packPlan(minutes: number): [string, number, string][] {
  const base = PLAN.reduce((s, p) => s + p[1], 0);
  const want = minutes > 0 ? minutes : base;
  const parts = PLAN.map(([t, m, d]) => [t, Math.max(5, Math.round((m * want) / base / 5) * 5), d] as [string, number, string]);
  const off = want - parts.reduce((s, p) => s + p[1], 0);
  parts[0] = [parts[0][0], Math.max(5, parts[0][1] + off), parts[0][2]];
  return parts;
}

/** "18 Carrington Grove, Carrington, Nottingham" → street, area, town; a flat keeps its number with the street. */
export function splitAddress(address: string, postcode: string): { street: string; area: string; town: string } {
  const pc = postcode.trim().toUpperCase();
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p.toUpperCase() !== pc && !/^(uk|united kingdom|england|scotland|wales|gb)$/i.test(p))
    .map((p) => (pc && p.toUpperCase().endsWith(` ${pc}`) ? p.slice(0, -pc.length).trim() : p));
  if (!parts.length) return { street: address.trim(), area: "", town: "" };
  const flat = /^(flat|apartment|apt|unit|room|studio)\b/i.test(parts[0]) && parts.length > 1;
  const street = flat ? `${parts[0]}, ${parts[1]}` : parts[0];
  const rest = parts.slice(flat ? 2 : 1);
  return { street, area: rest.length >= 2 ? rest[rest.length - 2] : "", town: rest[rest.length - 1] ?? "" };
}

const LONDON = "Europe/London";
const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: LONDON }).format(d);
const clock = (d: Date) => part(d, { hour: "2-digit", minute: "2-digit", hour12: false });
const longDate = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.valueOf()) ? part(d, { day: "numeric", month: "long", year: "numeric" }) : "";
};
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
const mmss = (secs: number | null | undefined) => (secs && secs > 0 ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}` : "");

/** Only a deck with a booked time can be the pack: every slide is built round the visit. */
export const canBePack = (deck: Pick<PresentDeck, "startsAt">) => Boolean(deck.startsAt && !Number.isNaN(new Date(deck.startsAt).valueOf()));

/** The pack's `D` from a deck. `deck.welcomeVideo` must already be checked as playable (lib/present-video). */
/** "A touch" down (James, 23 Oct 2026), until an agent drags their own. */
export const DEFAULT_PHOTO_Y = 6;

export function packData(
  deck: PresentDeck,
  token: string | null,
  opts: { meet?: PackData["meet"]; agentPhotoY?: number | null; frame?: boolean; questions?: PackQuestion[] } = {}
): PackData {
  const meet = opts.meet ?? "headshot";
  const start = new Date(deck.startsAt as string);
  const minutes = deck.minutes > 0 ? deck.minutes : 45;
  const end = new Date(start.valueOf() + minutes * 60_000);
  const a = deck.agent;
  const first = a.firstName || firstNameOf(a.name);
  const where = splitAddress(deck.property.address, deck.property.postcode ?? "");
  const v = deck.welcomeVideo;
  const src = v?.status === "ready" ? v.videoUrl ?? "" : "";
  return {
    token,
    meet,
    frame: Boolean(opts.frame && token),
    ics: icsFor(
      { landlordName: deck.recipientName, address: deck.property.address, whenPretty: deck.whenPretty, startsAt: deck.startsAt, minutes, agentName: a.name, agentPhone: a.phone },
      deck.createdAt
    ),
    landlord: { first: firstNameOf(deck.recipientName) || deck.recipientName, full: deck.recipientName },
    property: { ...where, postcode: deck.property.postcode ?? "", type: deck.property.propertyType ?? "", beds: deck.property.beds },
    visit: {
      weekday: part(start, { weekday: "long" }),
      day: part(start, { day: "numeric" }),
      month: part(start, { month: "long" }),
      year: part(start, { year: "numeric" }),
      start: clock(start),
      end: clock(end),
      minutes,
      sent: longDate(deck.updatedAt || deck.createdAt),
    },
    agent: {
      first,
      name: a.name,
      /* Everyone at TLE is a Letting Expert; REX's own title is empty for half the book. */
      role: a.title?.trim() || "Letting Expert",
      initials: initialsOf(a.name),
      phone: a.phone ?? "",
      email: a.email ?? "",
      photo: a.photo ?? "",
      photoY: a.photoY ?? opts.agentPhotoY ?? DEFAULT_PHOTO_Y,
      note: a.bio?.trim() ? a.bio.trim().replace(/\s*\n+\s*/g, " ") : NOTE,
      video: src ? { length: mmss(v?.durationSecs), link: null, src } : null,
    },
    plan: packPlan(minutes),
    ready: READY,
    questions: (opts.questions ?? DEFAULT_PACK_QUESTIONS).map((x) => [x.q, x.options] as [string, string[]]),
    arrive: ARRIVE,
  };
}

let page: string | null = null;
/** The design's page with this pack's data in it. `<` is escaped so no value can close the script. */
export function packHtml(d: PackData): string {
  /* Read once in production; afresh while developing, so an edit to the page shows on reload. */
  if (!page || process.env.NODE_ENV !== "production") page = readFileSync(path.join(process.cwd(), "lib/decks/pre-appraisal-pack.html"), "utf8");
  const json = JSON.stringify(d)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
  return page.replace("/*__PACK_DATA__*/null", () => json);
}

/* ── Where each agent's headshot sits (23 Oct 2026) ── */
const frameKey = (userId: string) => `photo_frame:${userId}`;

/** The agent's own default for moving their headshot down, if they have saved one. */
export async function agentPhotoY(userId: string | null | undefined): Promise<number | null> {
  if (!userId || !hasDb()) return null;
  const rows = await q<{ value: { y?: number } }>(`SELECT value FROM os_settings WHERE key = $1`, [frameKey(userId)]).catch(() => []);
  const y = rows[0]?.value?.y;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

/** Saves a dragged position onto one pack and as the agent's default for the next. */
export async function savePhotoY(token: string, authorId: string, y: number, by: string): Promise<void> {
  await q(`UPDATE os_presentations SET deck = jsonb_set(deck, '{agent,photoY}', to_jsonb($2::numeric)) WHERE token = $1`, [token, y]);
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [frameKey(authorId), JSON.stringify({ y }), by]
  );
}

/* ── Each agent's own quick questions (26 Oct 2026 team call) ── */

/** An agent's questions and whether they show the slide; the defaults for anybody who hasn't changed them. */
export async function packQuestionsFor(userId: string | null | undefined): Promise<PackQuestionsSetting> {
  if (!userId || !hasDb()) return readSetting(null);
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, PRE_PACK_QUESTIONS_PREF]).catch(() => []);
  return readSetting(rows[0]?.value ?? null);
}

/**
 * The questions a pack shows: those of the agent whose appraisal it is - the
 * person on the deck, found by their email, else whoever made it - never the
 * person looking at it. An empty list leaves the slide out.
 */
export async function packQuestionsForDeck(deck: PresentDeck, authorId: string | null): Promise<PackQuestion[]> {
  const email = (deck.agent?.email ?? "").trim().toLowerCase();
  const byEmail =
    email && hasDb()
      ? (await q<{ id: string }>(`SELECT id FROM os_users WHERE lower(email) = $1 LIMIT 1`, [email]).catch(() => []))[0]?.id ?? null
      : null;
  const s = await packQuestionsFor(byEmail ?? authorId);
  return s.show ? s.questions : [];
}
