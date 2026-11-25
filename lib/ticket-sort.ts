/**
 * TICKETS SORT THEMSELVES (James, 25 Nov 2026: fewer tickets coming to him;
 * the easy ones answered or fixed without him). Behind the "ticketsort"
 * switch. Off, every report waits for James exactly as before.
 *
 * Each NEW report a person sends (never one the OS logged itself) is read as
 * it lands, after it is saved and after the reporter has their answer, and
 * put in one of four piles:
 *
 *   ask     a how-do-I. Steve answers it as the reporter (their own book, read
 *           only: nothing proposed is pressed, nothing is sent), the answer is
 *           left in their Steve chat, and the ticket stays on James's list as
 *           Steve Answered with the answer beside it.
 *   find    a missing landlord or tenant detail that Let Steve Find It covers.
 *           Steve leaves a line pointing them to it.
 *   bug     something broken, reported by a person, not an idea. Sent to
 *           Claude by itself: at most AUTO_SENDS_A_DAY across the OS in any
 *           24 hours, once per ticket, and never when it touches the topics
 *           below. The pull request still waits for James's Push It Live.
 *   james   everything else, and anything about money, terms, what customers
 *           are sent, sign-in or access, or deleting. Nothing changes.
 *
 * Whatever pile, context.sort and context.sortWhy say which and why, so James
 * can see what the sorter thought.
 *
 * The classifier (sortOf) is pure and imports only the report form's own
 * readers, so it can be run over old reports. Everything that touches the
 * database is imported inside the functions that need it.
 */

import { ASKED_HIM, HOW_TO, recordOn } from "@/lib/report-deflect";
import { findableFor } from "@/lib/steve-find-shared";
import type { Scope } from "@/lib/scope";
import type { OsUser } from "@/lib/users";

export type Sort = "ask" | "find" | "bug" | "james" | "repeat";

/** At most this many sent to Claude by the sorter, across the OS, in any 24 hours. */
export const AUTO_SENDS_A_DAY = 5;

/* Typed fast: apostrophes optional, as in lib/report-deflect. */
const NOT = String.raw`(?:not|never|no longer|is ?n'?t|are ?n'?t|was ?n'?t|does ?n'?t|do ?n'?t|did ?n'?t|has ?n'?t|have ?n'?t|wo ?n'?t|wont|cant|can'?t|cannot|will not)`;

/* An idea is a decision, not a fault or a question. */
const IDEA = new RegExp(
  [
    String.raw`\b(?:can|could) (?:we|you) (?:please |pls )?(?:have|get|add|put|integrate|include|make|create|build)\b`,
    String.raw`\b(?:it|this|that) (?:would|'?d) be (?:good|great|nice|helpful|useful|handy|better)\b`,
    String.raw`\bwould be (?:good|great|nice|helpful|useful|handy|better) (?:if|to)\b`,
    String.raw`\bplease (?:can (?:we|you) )?add\b`,
    String.raw`\bsuggest(?:ion|ions|ing)?\b`,
    String.raw`\bfeature request\b`,
    String.raw`\bidea\b`,
    String.raw`\bwish(?:list)?\b`,
    String.raw`\bwould love\b`,
    String.raw`\bnice to have\b`,
    String.raw`\bwhat if we\b`,
    String.raw`\b(?:should|could) (?:we|there) (?:have|be able|add|show)\b`,
  ].join("|"),
  "i"
);

/* James's topics: never answered or sent on by the sorter. */
const PEOPLE = String.raw`(?:landlords?|LLs?|tenants?|applicants?|customers?|clients?|contractors?|guarantors?|vendors?|owners?)`;
const JAMES_TOPICS: Array<{ why: string; words: RegExp }> = [
  {
    why: "about money",
    words:
      /\b(?:money|pay(?:s|ing|ment|ments|out|outs)?|paid|deposits?|rent(?:s|al|als)?|fees?|invoices?|refunds?|charges?|charged|bank|sort code|account (?:number|details)|payprop|holding (?:fee|deposit)|arrears|commission|VAT|prices?|costs?)\b|£\s?\d/i,
  },
  { why: "about terms or wording", words: /\b(?:terms(?: of business)?|T ?& ?Cs?|wording|clauses?|contracts?|agreements?|docuseal)\b/i },
  {
    why: "about what customers are sent",
    words: new RegExp(
      [
        String.raw`\b(?:e-?mails?|texts?|sms|whats ?apps?|letters?|messages?) (?:to|for|from) (?:the |a |an |our |my |their )?${PEOPLE}\b`,
        String.raw`\b(?:newsletters?|mail-?outs?)\b`,
      ].join("|"),
      "i"
    ),
  },
  { why: "about signing in or access", words: /\b(?:sign(?:ed|ing)? ?(?:in|on|out)|log(?:ged|ging)? ?(?:in|on|out)|login|logon|password|passcode|locked out|lock(?:ed)? (?:me|us|them) out|permissions?|(?:no|lost|get|give|need|request(?:ed)?|grant(?:ed)?|my) access|access (?:rights|levels?|to (?:the )?(?:os|tle|system|account))|admin rights|two[- ]factor|2fa|mfa|invite[ds]?|invitation|authenticat\w*)\b/i },
  { why: "about deleting", words: /\b(?:delet(?:e|ed|es|ing)|remov(?:e|ed|es|ing)|get rid of|got rid of|erase[ds]?|wipe[ds]?)\b/i },
];
/* What customers are sent, the other way round: a sending word AND a customer
   in the same report ("the tenant was sent the wrong one", "it emailed the
   landlord twice"). A missing landlord's email has no sending word. */
const SENDING = /\b(?:sent|send(?:s|ing)?|emailed|emailing|texted|texting|messaged|messaging|went out|gone out|go(?:es)? out|received|receiving|got (?:an? |the )?(?:e-?mail|text|message|letter))\b/i;
const CUSTOMER = new RegExp(String.raw`\b${PEOPLE}\b`, "i");

/** Which of James's topics the words touch, or null. */
export function jamesTopic(text: string): string | null {
  const hit = JAMES_TOPICS.find((t) => t.words.test(text));
  if (hit) return hit.why;
  if (SENDING.test(text) && CUSTOMER.test(text)) return "about what customers are sent";
  return null;
}

/* Something broken: an error, a screen that won't load, save, open or work. */
const BROKEN = new RegExp(
  [
    String.raw`\berrors?\b`,
    String.raw`\b(?:something )?went wrong\b`,
    String.raw`\bbroken\b|\bbroke\b`,
    String.raw`\bstuck\b`,
    String.raw`\bcrash(?:es|ed|ing)?\b`,
    String.raw`\b(?:freez(?:es|ing)|frozen)\b`,
    String.raw`\bglitch(?:y|es|ing)?\b`,
    String.raw`\bbug(?:gy)?\b`,
    String.raw`\bfail(?:s|ed|ing|ure)?\b`,
    String.raw`\btim(?:ed|es|ing) out\b|\btimeout\b`,
    String.raw`\bkeeps? (?:loading|spinning|crashing|failing|refreshing|freezing)\b`,
    String.raw`\bspinning\b`,
    String.raw`\bnothing happens\b|\bdoes nothing\b`,
    String.raw`\b(?:blank|white|empty) (?:page|screen)\b`,
    String.raw`\b(?:500|502|503|504|404)\b`,
    String.raw`\bstopped working\b`,
    String.raw`\b${NOT} (?:\w+ )?(?:load(?:s|ing|ed)?|sav(?:e|es|ed|ing)|work(?:s|ing|ed)?|open(?:s|ing|ed)?|submit(?:s|ting|ted)?|upload(?:s|ing|ed)?|refresh(?:es|ing)?|respond(?:s|ing)?|go(?:es)? through|went through)\b`,
    /* How faults are really described (25 Nov 2026, from 365 reports): a
       detail that doesn't come across, a home that vanished, a button that
       won't let them, a tile whose number the list doesn't bear out. */
    String.raw`\b${NOT} (?:\w+ ){0,2}(?:pull(?:s|ing|ed)?|carr(?:y|ies|ying|ied)|map(?:s|ping|ped)?|sync(?:s|ing|ed)?|transfer(?:s|ring|red)?|com(?:e|es|ing)|came|filter(?:s|ing|ed)?) (?:through|across|over|in)\b`,
    String.raw`\b${NOT} (?:\w+ ){0,2}(?:showing|appearing|updating|updated|recogni[sz](?:e|es|ed|ing)|accept(?:s|ed|ing)?|connect(?:s|ed|ing)?|click(?:able)?)\b`,
    String.raw`\b(?:has |have )?(?:disappeared|vanished)\b`,
    String.raw`\b(?:wo ?n'?t|will not|does ?n'?t|doesnt) (?:let|allow) (?:me|us|them|you)\b`,
    String.raw`\b(?:can ?n'?t|cannot|can not|unable to) (?:click|press|select|tick|approve|upload|save|submit|attach|add|instruct|push|amend|change)\b`,
    String.raw`\bnothing (?:is )?(?:happening|happens|comes? up|came up|appears|shows|loads)\b`,
    String.raw`\bstill (?:showing|appearing|saying|says|getting)\b`,
    String.raw`\b(?:reverts?|reverted|jumps? around|goes nowhere)\b`,
    String.raw`\b(?:says|shows?|showing|states?) \d+\b.{0,80}\b(?:click|open|nothing|can'?t see|none|empty|don'?t come up|doesn'?t come up)`,
  ].join("|"),
  "i"
);

export interface SortInput {
  body: string;
  path: string;
  kind: string;
  /** A person sent it (a signed-in reporter), not the OS. */
  byPerson: boolean;
  /** What the report form offered and they turned down (context.deflect). */
  turnedDown?: string | null;
}

/** Which pile, and why in a few words. Null for a report the OS logged itself. */
export function sortOf(t: SortInput): { sort: Sort; why: string } | null {
  if (t.kind === "auto") return null;
  const words = t.body.trim();
  if (!t.byPerson) return { sort: "james", why: "not from a person" };
  if (words.length < 8) return { sort: "james", why: "too short to sort" };
  if (t.kind === "idea" || IDEA.test(words)) return { sort: "james", why: "an idea" };
  const topic = jamesTopic(words);
  if (topic) return { sort: "james", why: topic };
  /* They were offered Let Steve Find It and sent it anyway: he has looked. */
  const finds = findableFor(words, t.path);
  if (finds && t.turnedDown !== "find") return { sort: "find", why: `a missing ${finds.who ?? "landlord or tenant"} detail` };
  if (BROKEN.test(words)) return { sort: "bug", why: "something broken" };
  /* Offered Ask Steve first and sent it anyway: he has had his go. */
  if (t.turnedDown !== "ask" && ((HOW_TO.test(words) && !ASKED_HIM.test(words)) || t.kind === "confusing")) {
    return { sort: "ask", why: t.kind === "confusing" && !HOW_TO.test(words) ? "marked confusing" : "a how-do-I" };
  }
  if (finds) return { sort: "james", why: "Steve already looked" };
  return { sort: "james", why: "not one it can sort" };
}

/* ── The switch ─────────────────────────────────────────────────────────── */

/**
 * Whether the sorter runs. It is about James's queue, not about what the
 * reporter sees, so it is read for the person who set the switch, as an
 * owner: whatever the level (Only me, Owners, Testers, Everyone), the person
 * whose queue it is sees it on, so every incoming report is sorted. Off is off.
 */
export async function sorterOn(): Promise<boolean> {
  const { lookRows, lookFor } = await import("@/lib/new-look-store");
  const row = (await lookRows()).find((r) => r.id === "ticketsort");
  if (!row || row.level === "off" || !row.changedBy) return false;
  return (await lookFor({ email: row.changedBy, role: "owner" })).ticketsort === true;
}

/* ── Sorting one ticket ─────────────────────────────────────────────────── */

type Reporter = { id: string; email: string; name: string | null; role: OsUser["role"] };

async function putCtx(id: string, add: Record<string, unknown>): Promise<void> {
  const { q } = await import("@/lib/db");
  await q(`UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [id, JSON.stringify(add)]);
}

const short = (s: string, n = 200) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

/**
 * Sorts one new report. Called after the report is saved and answered, never
 * awaited by the reporter's request; it never throws.
 */
export async function sortNewTicket(
  t: { id: string; body: string; path: string; kind: string; context: Record<string, unknown> | undefined },
  reporter: Reporter,
  scope: Scope,
  origin: string
): Promise<void> {
  try {
    const { hasDb } = await import("@/lib/db");
    if (!hasDb() || t.kind === "auto" || !reporter.id) return;
    if (!(await sorterOn())) return;
    /* The same report again: put with the first, never sent on twice. */
    if (await linkRepeat(t, reporter)) return;
    const deflect = t.context?.deflect as { offered?: unknown } | undefined;
    const s = sortOf({ body: t.body, path: t.path, kind: t.kind, byPerson: true, turnedDown: typeof deflect?.offered === "string" ? deflect.offered : null });
    if (!s) return;
    await putCtx(t.id, { sort: s.sort, sortWhy: s.why, sortAt: new Date().toISOString() });
    if (s.sort === "ask") await steveAnswers(t, reporter, scope);
    else if (s.sort === "find") await pointToFind(t, reporter);
    else if (s.sort === "bug") await sendItOn(t, origin);
  } catch (e) {
    console.error("[ticket-sort]", t.id, e instanceof Error ? e.message : e);
    await putCtx(t.id, { sortError: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => null);
  }
}

/* ── The same report twice ──────────────────────────────────────────────
 *
 * Measured on 365 reports (25 Nov 2026): a home with five tickets is nearly
 * always five different problems, so a repeat is judged by the words, not
 * the home. Same record (its screen's address), within a fortnight, and at
 * least a quarter of the meaningful words shared. That caught the three
 * genuine repeats in 75 days and nothing else. */

const REPEAT_DAYS = 14;
const REPEAT_ALIKE = 0.25;
const STOP = new Set(
  "the a an is it to of and in on for this that my me we our not but be are was has have there its can cant with as at from so if or do does doesnt dont please what when where why how still also just been any all which they them new one again".split(" ")
);

export function recordKey(path: string): string | null {
  const m = /^\/(listings|applications|portfolio|maintenance|market-appraisals|pre-tenancy\/plc|plc)\/([^/?#]+)/.exec(path || "");
  return m && !/^(new|start|dashboard)$/.test(m[2]) ? `/${m[1]}/${m[2]}` : null;
}

const meaningful = (text: string) =>
  new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** How alike two reports read, 0 to 1 (shared meaningful words over all of them). */
export function alike(a: string, b: string): number {
  const wa = meaningful(a);
  const wb = meaningful(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.max(1, new Set([...wa, ...wb]).size);
}

async function linkRepeat(
  t: { id: string; body: string; path: string },
  reporter: Reporter
): Promise<boolean> {
  const key = recordKey(t.path);
  if (!key || t.body.trim().length < 8) return false;
  const { q } = await import("@/lib/db");
  const earlier = await q<{ id: string; body: string; state: string; created_at: Date; fix: string | null }>(
    `SELECT id, body, state, created_at, context->>'fixStory' AS fix FROM os_bugs
      WHERE id <> $1 AND coalesce(kind, '') NOT IN ('auto', 'idea') AND state IN ('open', 'fixed')
        AND (path = $2 OR path LIKE $2 || '?%' OR path LIKE $2 || '/%')
        AND created_at > NOW() - make_interval(days => $3)
      ORDER BY created_at DESC LIMIT 20`,
    [t.id, key, REPEAT_DAYS]
  );
  const hit = earlier.find((e) => alike(e.body ?? "", t.body) >= REPEAT_ALIKE);
  if (!hit) return false;
  const when = new Date(hit.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" });
  /* Fixed already: say what changed, then sort it as usual - still
     happening after a fix is a fault worth a fresh look. */
  if (hit.state === "fixed") {
    await putCtx(t.id, { repeatOf: hit.id, repeatOfFixed: true });
    if (hit.fix) {
      const { logLine } = await import("@/lib/assistant-log");
      await logLine({
        userId: reporter.id,
        userEmail: reporter.email,
        thread: "ticket",
        role: "assistant",
        text: [`About what you reported: "${short(t.body)}"`, "", `Something very like it was reported on ${when} and fixed: ${short(hit.fix, 600)}`, "", "If it's still happening, yours is with James and will be looked at again."].join("\n"),
        path: t.path,
        kind: "ask",
      });
    }
    return false;
  }
  await putCtx(t.id, { sort: "repeat", sortWhy: "the same as an open ticket", sortAt: new Date().toISOString(), repeatOf: hit.id });
  const { logLine } = await import("@/lib/assistant-log");
  await logLine({
    userId: reporter.id,
    userEmail: reporter.email,
    thread: "ticket",
    role: "assistant",
    text: [`About what you reported: "${short(t.body)}"`, "", `This looks like the one sent on ${when} ("${short(hit.body, 120)}"), which is already being looked at. I've put yours with it, so you'll hear when it's sorted.`].join("\n"),
    path: t.path,
    kind: "ask",
  });
  return true;
}

/* ── ask: Steve answers it, in their chat ──────────────────────────────── */

/* Said to him with the question: answer in words, as the reporter, and do
   nothing. Proposals, screen steps and walk-throughs that come back are
   dropped here whatever he does; this keeps him from writing the ones that
   save on their own. */
const READ_ONLY = (path: string) =>
  `[System, not the person: they sent this as a report to James${path ? ` from the ${path} screen` : ""} instead of asking you, and it has gone to him. ` +
  "Answer it for them in plain words: how to do it and where the button is. Read whatever you need, but do nothing: no card, email, note, reminder, task, job, lesson or memory, and nothing to press on their screen, because nothing you offer here will be pressed and nobody will see it but them. " +
  "If you cannot answer it for sure from what you can read, or it is really a fault, reply with exactly NOT SURE and nothing else.]";

/* His fallbacks (lib/assistant-brain ask) are not answers. */
const NOT_AN_ANSWER = /^\s*NOT SURE\b|went round in circles|couldn'?t put an answer together/i;

async function steveAnswers(t: { id: string; body: string; path: string }, reporter: Reporter, scope: Scope): Promise<void> {
  const { ask, assistantConfigured, asksForAYes } = await import("@/lib/assistant-brain");
  if (!assistantConfigured()) {
    await putCtx(t.id, { sortHeld: "Steve isn't connected here" });
    return;
  }
  const { assistantNameFor } = await import("@/lib/assistant-name");
  const assistantName = await assistantNameFor(reporter.id).catch(() => null);
  const rec = recordOn(t.path);
  const listing = rec === "listing" ? /^\/listings\/([^/?#]+)/.exec(t.path)?.[1] ?? null : null;
  /* As them: their own book, their screen. No `me`, so the tools that save
     something for a person (memory, jobs, their mailbox) have nobody to save
     it for. */
  const answer = await ask([], `${t.body}\n\n${READ_ONLY(t.path)}`, {
    readOnly: true,
    /* Them, so the look-up tools behind their switches answer as them.
       readOnly refuses every tool that would save for them. */
    me: { id: reporter.id, name: reporter.name ?? "", email: reporter.email },
    scope,
    path: t.path || null,
    openListingId: listing,
    assistantName,
  });
  if (answer.canned) {
    await putCtx(t.id, { sortHeld: "Steve couldn't answer just now" });
    return;
  }
  const { plain } = await import("@/lib/ticket-fixed");
  const text = plain(answer.text);
  const sure = text && !NOT_AN_ANSWER.test(text) && !answer.proposal && !answer.screen && !asksForAYes(text);
  const words = sure
    ? [`About what you reported: "${short(t.body)}"`, "", text, "", "It's still with James as well, so if that doesn't sort it, nothing is lost."].join("\n")
    : `I had a look at what you reported ("${short(t.body, 120)}") but couldn't answer it for sure, so it's with James.`;
  /* Logged with what it cost, so the daily cap (lib/assistant-brain budget) counts it. */
  const { logLine } = await import("@/lib/assistant-log");
  await logLine({
    userId: reporter.id,
    userEmail: reporter.email,
    thread: "ticket",
    role: "assistant",
    text: words,
    path: t.path,
    kind: "ask",
    inTokens: answer.inTokens,
    outTokens: answer.outTokens,
  });
  if (!sure) {
    await putCtx(t.id, { sortHeld: "Steve wasn't sure" });
    return;
  }
  /* Only while nobody else has picked it up: James may have pressed Send to
     Claude while Steve was thinking. Priority C, as Claude's not_a_bug. */
  const { q } = await import("@/lib/db");
  await q(
    `UPDATE os_bugs SET bot_state = 'steve_answered', bot_at = NOW(), bot_note = 'Steve answered it in their chat.',
            priority = coalesce(priority, 'C'),
            context = coalesce(context, '{}'::jsonb) || jsonb_build_object('steveAnswer', $2::text, 'steveAnsweredAt', now()::text)
      WHERE id = $1 AND state = 'open' AND bot_state = ''`,
    [t.id, text.slice(0, 4000)]
  );
}

/* ── find: point them to Let Steve Find It ──────────────────────────────── */

async function pointToFind(t: { id: string; body: string; path: string }, reporter: Reporter): Promise<void> {
  /* The form offers it only with the stevefind switch on for them; without
     it there is nothing to point at, and James has the ticket as before. */
  const { lookFor } = await import("@/lib/new-look-store");
  if (!(await lookFor({ email: reporter.email, role: reporter.role })).stevefind) {
    await putCtx(t.id, { sortHeld: "Find It isn't on for them" });
    return;
  }
  const { assistantNameFor } = await import("@/lib/assistant-name");
  const name = (await assistantNameFor(reporter.id).catch(() => null)) || "Steve";
  const { logLine } = await import("@/lib/assistant-log");
  await logLine({
    userId: reporter.id,
    userEmail: reporter.email,
    thread: "ticket",
    role: "assistant",
    text: [
      `About what you reported: "${short(t.body)}"`,
      "",
      `I can look for a missing landlord or tenant myself. On the home's page, tell me what's missing in the report form and press Let ${name} Find It: I'll show you what I find and where, and you just say yes or no.`,
      "",
      "It's still with James as well.",
    ].join("\n"),
    path: t.path,
    kind: "ask",
  });
  await putCtx(t.id, { sortPointedAt: new Date().toISOString() });
}

/* ── bug: send it to Claude, within the cap ─────────────────────────────── */

async function sendItOn(t: { id: string; body: string }, origin: string): Promise<void> {
  /* Read again here, so nothing about James's topics is ever sent on, whatever called this. */
  if (jamesTopic(t.body) || IDEA.test(t.body)) return;
  const { claudeConfigured, sendToClaude } = await import("@/lib/claude-tickets");
  if (!claudeConfigured()) {
    await putCtx(t.id, { sortHeld: "Claude isn't connected" });
    return;
  }
  const { q } = await import("@/lib/db");
  /* Claims one of the day's sends and marks this ticket in one statement: once
     per ticket (sortSentAt is never cleared), and only while fewer than
     AUTO_SENDS_A_DAY tickets carry one from the last 24 hours. A failed send
     keeps its mark and counts, so a refusing routine cannot be retried into. */
  const claimed = await q<{ id: string }>(
    `UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('sortSentAt', now()::text)
      WHERE id = $1 AND state = 'open' AND bot_state = '' AND NOT coalesce(context, '{}'::jsonb) ? 'sortSentAt'
        AND (SELECT count(*) FROM os_bugs x
              WHERE x.context ? 'sortSentAt' AND (x.context->>'sortSentAt')::timestamptz > NOW() - INTERVAL '24 hours') < $2
      RETURNING id`,
    [t.id, AUTO_SENDS_A_DAY]
  );
  if (!claimed.length) {
    /* Already with somebody (James pressed it first, or it was sent before), or the day's sends are used. */
    const now = await q<{ free: boolean }>(
      `SELECT (state = 'open' AND bot_state = '' AND NOT coalesce(context, '{}'::jsonb) ? 'sortSentAt') AS free FROM os_bugs WHERE id = $1`,
      [t.id]
    );
    if (now[0]?.free) await putCtx(t.id, { sortHeld: `${AUTO_SENDS_A_DAY} already sent to Claude today` });
    return;
  }
  try {
    await sendToClaude(t.id, "the ticket sorter", origin);
  } catch (e) {
    await putCtx(t.id, { sortSendError: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
  }
}
