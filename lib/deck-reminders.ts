import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import { presentationsFor, type PresentationRow } from "@/lib/present-store";
import { recipientFor } from "@/lib/agent-recipient";
import { startVerification } from "@/lib/verification";
import { sendEmail } from "@/lib/resend";
import { skyListShell } from "@/lib/email/shell-sky";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * The agent's presentation, in their inbox (James, 17 Sep 2026).
 *
 *   Send it to my email   the builder's button, whenever they like.
 *   The day before        "You haven't built your presentation yet", with a
 *                         button straight into the builder - only when there
 *                         is no presentation for the visit.
 *   On the day            the presentation, sent to the agent, unless they
 *                         have already sent it to themselves.
 *
 * All three go to a colleague on our own domain, never a landlord, so no
 * customer switch stands in front of them (lib/email-policy still refuses
 * anything that is not ours at the transport).
 *
 * What went is kept in os_case_state:
 *   deck-emailed      <presentation token>              sent to the agent, by hand or on the day
 *   deck-build-chase  <appraisal id>|<appointment ISO>   the day-before nudge, once per visit time
 */

const EMAILED = "deck-emailed";
const BUILD_CHASE = "deck-build-chase";

/** From 9am the day before for the nudge; from 7am on the day for the deck. */
const CHASE_FROM_HOUR = 9;
const DAY_OF_FROM_HOUR = 7;

type Me = { id?: string; email: string; name: string };

/** The appraisal's own presentation - the one the builder makes - newest first. */
export async function appraisalDeckFor(ma: MarketAppraisal): Promise<PresentationRow | null> {
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const rows = (await Promise.all(refs.map((r) => presentationsFor(r).catch(() => [])))).flat();
  return rows.filter((r) => r.kind === "appraisal").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function lastEmailed(token: string): Promise<{ sentAt: string; to: string; auto: boolean } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: { sentAt: string; to: string; auto: boolean } }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [EMAILED, token]
  ).catch(() => []);
  return rows[0]?.payload ?? null;
}

/* ── the words ─────────────────────────────────────────────────────────── */

const london = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", ...o });

function visitWords(ma: MarketAppraisal): string {
  if (!ma.appointmentAt) return "";
  return `${london(ma.appointmentAt, { weekday: "long", day: "numeric", month: "long" })} at ${london(ma.appointmentAt, { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "")}`;
}

/** A single-use sign-in straight into the builder, for the recipient. */
async function buildLink(email: string, ma: MarketAppraisal, origin: string): Promise<string> {
  const base = origin.replace(/\/+$/, "");
  try {
    const { token } = await startVerification(email, "record", { keepOthers: true });
    return `${base}/api/record/enter?k=${encodeURIComponent(token)}&a=${encodeURIComponent(ma.id)}&to=build`;
  } catch {
    return `${base}/market-appraisals/${encodeURIComponent(ma.id)}/build`;
  }
}

export function deckEmail(opts: { ma: MarketAppraisal; deckUrl: string; editUrl: string; firstName: string; onTheDay: boolean }) {
  const when = visitWords(opts.ma);
  const heading = opts.onTheDay ? "Your Presentation for Today" : "Your Presentation";
  const intro = [
    opts.firstName ? `${opts.firstName}, here` : "Here",
    ` is your presentation for ${opts.ma.address}`,
    when ? `, ready for ${when}` : "",
    ". Open it on the day and take the landlord through it.",
  ].join("");
  return {
    subject: opts.onTheDay ? `Today: your presentation for ${opts.ma.address}` : `Your presentation for ${opts.ma.address}`,
    text: [heading, "", intro, "", `Open presentation: ${opts.deckUrl}`, `Edit presentation: ${opts.editUrl}`].join("\n"),
    html: skyListShell({
      heading,
      intro,
      button: "Open presentation",
      link: opts.deckUrl,
      rows: [{ title: "Edit presentation", detail: "Change anything you like. The link stays the same." }],
      rowHref: opts.editUrl,
      rowMarkers: false,
      rowStyle: "bare",
    }),
  };
}

export function buildChaseEmail(opts: { ma: MarketAppraisal; buildUrl: string; firstName: string }) {
  const when = visitWords(opts.ma);
  const heading = "You Haven't Built Your Presentation Yet";
  const intro = [
    opts.firstName ? `${opts.firstName}, your` : "Your",
    ` appraisal at ${opts.ma.address} is `,
    when ? `tomorrow, ${when}` : "tomorrow",
    ", and there is no presentation for it yet. It takes a few minutes: pick the comparables, check the pages, and it is ready to show.",
  ].join("");
  return {
    subject: `Build your presentation for ${opts.ma.address}`,
    text: [heading, "", intro, "", `Build presentation: ${opts.buildUrl}`].join("\n"),
    html: skyListShell({
      heading,
      intro,
      button: "Build presentation",
      link: opts.buildUrl,
      tip: "You can change it as many times as you like before the visit, and the link stays the same.",
      tipQuiet: true,
    }),
  };
}

/* ── sending ───────────────────────────────────────────────────────────── */

/** "Send it to my email", from the builder. Always goes; recorded, so the day's own send knows. */
export async function emailDeckToMe(opts: { token: string; me: Me; origin: string; appraisalId?: string | null }): Promise<{ to: string }> {
  const rows = await q<{ id: string }>(
    `SELECT a.id FROM os_presentations p
       JOIN os_market_appraisals a ON a.lead_id = p.ref OR a.id = p.ref
      WHERE p.token = $1 LIMIT 1`,
    [opts.token]
  ).catch(() => []);
  const ma = await getAppraisal(opts.appraisalId || rows[0]?.id || "");
  if (!ma) throw new Error("Couldn't find the appraisal this presentation is for.");
  const base = opts.origin.replace(/\/+$/, "");
  const mail = deckEmail({
    ma,
    deckUrl: `${base}/present/${opts.token}`,
    editUrl: await buildLink(opts.me.email, ma, opts.origin),
    firstName: opts.me.name.split(/\s+/)[0] ?? "",
    onTheDay: false,
  });
  await sendEmail({ to: opts.me.email, subject: mail.subject, html: mail.html, text: mail.text });
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [EMAILED, opts.token, JSON.stringify({ sentAt: new Date().toISOString(), to: opts.me.email, auto: false }), opts.me.name || opts.me.email]
  ).catch(() => null);
  return { to: opts.me.email };
}

/** The agent on the file. Older files hold their email address where the
 *  name goes, so that is matched too; nobody matched means nobody is written to. */
async function agentFor(agent: string | null): Promise<{ email: string; name: string }> {
  const key = (agent ?? "").trim().toLowerCase();
  if (key.includes("@")) {
    const rows = await q<{ email: string; name: string }>(`SELECT email, name FROM os_users WHERE lower(email) = $1 LIMIT 1`, [key]).catch(() => []);
    return rows[0] ?? { email: "", name: "" };
  }
  return recipientFor(agent, { email: "", name: "" });
}

/** Hour and date as London has them, whatever the server's clock says. */
function londonNow(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
const londonDate = (d: Date) => londonNow(d).date;

/**
 * Claim the send before making it. Two overlapping cron runs must not both
 * email the agent; a failed send gives the claim back so the next run tries.
 */
async function claim(kind: string, key: string, payload: object): Promise<boolean> {
  const rows = await q<{ record_id: string }>(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), 'on the day')
     ON CONFLICT (kind, record_id) DO NOTHING
     RETURNING record_id`,
    [kind, key, JSON.stringify(payload)]
  ).catch(() => []);
  return rows.length > 0;
}
const release = (kind: string, key: string) =>
  q(`DELETE FROM os_case_state WHERE kind = $1 AND record_id = $2`, [kind, key]).catch(() => null);

/**
 * The sweep, run with the scheduled sends every few minutes. Looks only at
 * visits in the next day and a half that are still open.
 */
export async function runDeckReminders(origin: string, now = new Date()): Promise<{ chased: number; sent: number; failed: string[] }> {
  const out = { chased: 0, sent: 0, failed: [] as string[] };
  if (!hasDb()) return out;
  const due = await q<{ id: string }>(
    `SELECT id FROM os_market_appraisals
      WHERE appointment_at > $1::timestamptz AND appointment_at < $1::timestamptz + INTERVAL '40 hours'
        AND stage NOT IN ('won', 'lost')`,
    [now.toISOString()]
  ).catch(() => []);
  const today = londonNow(now);
  const tomorrow = londonDate(new Date(now.getTime() + 86400000));
  const base = origin.replace(/\/+$/, "");

  for (const { id } of due) {
    const ma = await getAppraisal(id).catch(() => null);
    if (!ma?.appointmentAt || ma.stage === "won" || ma.stage === "lost") continue;
    const visit = new Date(ma.appointmentAt);
    if (visit.getTime() <= now.getTime()) continue;
    const visitDay = londonDate(visit);
    const deck = await appraisalDeckFor(ma);
    const to = await agentFor(ma.agent);
    if (!to.email) continue;
    const firstName = to.name.split(/\s+/)[0] ?? "";

    /* The day before, from 9am: no presentation yet. */
    if (!deck && visitDay === tomorrow && today.hour >= CHASE_FROM_HOUR) {
      const key = `${ma.id}|${visit.toISOString()}`;
      if (await claim(BUILD_CHASE, key, { sentAt: now.toISOString(), to: to.email })) {
        try {
          const mail = buildChaseEmail({ ma, buildUrl: await buildLink(to.email, ma, origin), firstName });
          await sendEmail({ to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
          out.chased++;
        } catch (e) {
          await release(BUILD_CHASE, key);
          out.failed.push(`${ma.id}: ${e instanceof Error ? e.message : "chase failed"}`);
        }
      }
    }

    /* On the day, from 7am (or ninety minutes before an early visit): the
       presentation, unless they sent it to themselves already. */
    const early = visit.getTime() - 90 * 60000 <= now.getTime();
    if (deck && visitDay === today.date && (today.hour >= DAY_OF_FROM_HOUR || early)) {
      if (await claim(EMAILED, deck.token, { sentAt: now.toISOString(), to: to.email, auto: true })) {
        try {
          const mail = deckEmail({
            ma,
            deckUrl: `${base}/present/${deck.token}`,
            editUrl: await buildLink(to.email, ma, origin),
            firstName,
            onTheDay: true,
          });
          await sendEmail({ to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
          out.sent++;
        } catch (e) {
          await release(EMAILED, deck.token);
          out.failed.push(`${ma.id}: ${e instanceof Error ? e.message : "send failed"}`);
        }
      }
    }
  }
  return out;
}
