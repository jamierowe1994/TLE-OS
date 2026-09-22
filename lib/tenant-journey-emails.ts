import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { findUserByEmail, findUserById, type OsUser } from "@/lib/users";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { SITE } from "@/lib/email/tle-documents";
import { createPassport, findPassportByEmail } from "@/lib/passport";
import { getApplications } from "@/lib/applications";
import { rexConfigured } from "@/lib/rex";
import type { ReminderResult } from "@/lib/tenant-reminders";
import { alreadyDone, claim, deliver, firstName, logDone, london, release, userByName, validEmail } from "@/lib/tenant-email-send";
import {
  findListing,
  holdingFeeIfYes,
  homesListHtml,
  isScottish,
  liveBook,
  moveInCosts,
  pounds,
  similarHomes,
} from "@/lib/tenant-matching";

/**
 * The tenant emails that follow something happening (16 Sep 2026): the rest
 * of the tenant process map, wired on what the OS already records.
 *
 *   enquiry reply      a new Letting lead on a live listing (leads scan, 5 min)
 *   added welcome      an agent adds a tenant by hand (POST /api/contacts)
 *   how was it?        two hours after a TLE viewing ends (hourly)
 *   not for them       the tenant answers "not this one" on the feedback page
 *   shall we rebook?   an agent records a no-show on the viewing (hourly)
 *   anything close?    four days after Homes That Fit, no viewing since (hourly)
 *   application in     REX shows a new application, status received (hourly)
 *   not this one       REX moves an application to unsuccessful (hourly)
 *
 * All of them sit behind the same switch as the reminders - "Automatic tenant
 * emails" (key tenant_reminders) - and customer email. With it off every job
 * still runs and reports who it WOULD have written to, and writes nothing to
 * the log, so switching on is not a backlog.
 *
 * Same rules as lib/tenant-reminders: narrow windows, one log row per send,
 * and a send only ever logged once it is settled.
 */

type Out = ReminderResult[];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function automaticOn(): Promise<boolean> {
  return switchOn("tenant_reminders");
}

/** The tenant's passport link, minting one if they have none. Only on a real send. */
async function passportLink(p: { name: string; email: string; agentId: string | null }): Promise<string> {
  const existing = await findPassportByEmail(p.email, p.agentId).catch(() => null);
  const token = existing?.token ?? (await createPassport({ name: p.name, email: p.email, agentId: p.agentId })).token;
  return `${SITE}/tenant/passport/${token}`;
}

/** One send, logged when settled, reported either way. */
async function sendOne(
  out: Out,
  dry: boolean,
  p: {
    key: string;
    emailId: string;
    to: string;
    toName: string;
    agent: OsUser | null;
    vars: (live: boolean) => Promise<Record<string, string>>;
    would: string;
    meta?: unknown;
  }
) {
  if (await alreadyDone(p.key)) return;
  if (!validEmail(p.to)) {
    if (!dry) await logDone(p.key, p.emailId, p.to, "no_address", "No usable email address.");
    out.push({ key: p.key, emailId: p.emailId, to: p.to, subject: "", state: "skipped", detail: `${p.toName || "They"} have no usable email address.` });
    return;
  }
  const vars = await p.vars(!dry);
  const { subject, html } = await renderTleEmailLive(p.emailId, vars);
  if (dry) {
    out.push({ key: p.key, emailId: p.emailId, to: p.to, subject, state: "would", detail: p.would });
    return;
  }
  /* Claim it, then send it: a second run finds the claim and leaves it. */
  if (!(await claim(p.key, p.emailId, p.to))) return;
  const r = await deliver({ agent: p.agent, to: p.to, toName: p.toName, subject, html });
  if (r.final) await logDone(p.key, p.emailId, p.to, r.sent ? "sent" : "refused", r.detail, p.meta);
  else await release(p.key);
  out.push({ key: p.key, emailId: p.emailId, to: p.to, subject, state: r.sent ? "sent" : "failed", detail: r.detail });
}

/* ── The enquiry reply ─────────────────────────────────────────────────── */

type LeadRow = { id: string; name: string | null; email: string | null; listing_id: string | null; agent: string | null };

/**
 * New Letting leads on a listing we still have on: first seen in the last two
 * hours AND received in the last day, so a sweep that turns up an old enquiry
 * for the first time does not answer it a week late. A lead on a home that has
 * gone let agreed, or is not in the live book, is left to the agent.
 */
export async function enquiryReplies(opts: { dry?: boolean } = {}): Promise<Out> {
  const out: Out = [];
  if (!hasDb()) return out;
  const dry = Boolean(opts.dry) || !(await automaticOn());
  const leads = await q<LeadRow>(
    `SELECT id, name, email, listing_id, agent FROM os_leads
      WHERE enquiry = 'Letting'
        AND listing_id IS NOT NULL AND listing_id <> ''
        AND first_seen > NOW() - interval '2 hours'
        AND COALESCE(received_at, first_seen) > NOW() - interval '1 day'
        AND id NOT IN (SELECT id FROM os_hidden_leads)`
  );
  if (!leads.length) return out;
  const book = await liveBook();
  const agents = new Map<string, OsUser | null>();
  for (const l of leads) {
    const key = `tenant-enquiry-reply:${l.id}`;
    const listing = findListing(book, l.listing_id);
    if (!listing?.rentMonthly) {
      if (!(await alreadyDone(key))) {
        out.push({ key, emailId: "tenant-enquiry-reply", to: l.email ?? "", subject: "", state: "skipped", detail: "The home is not live or has no rent, so the agent answers this one." });
      }
      continue;
    }
    const agentName = (l.agent ?? "").trim();
    if (!agents.has(agentName)) agents.set(agentName, await userByName(agentName));
    const agent = agents.get(agentName) ?? null;
    const scottish = isScottish(listing.postcode);
    const costs = moveInCosts(listing.rentMonthly, scottish);
    const from = listing.availableFrom ? new Date(listing.availableFrom) : null;
    const address = [listing.name, listing.locality].filter(Boolean).join(", ");
    await sendOne(out, dry, {
      key,
      emailId: "tenant-enquiry-reply",
      to: (l.email ?? "").trim(),
      toName: l.name ?? "",
      agent,
      would: `Would answer ${l.name ?? "the enquiry"} about ${address}.`,
      vars: async (live) => ({
        firstName: firstName(l.name ?? ""),
        address,
        rent: `${pounds(listing.rentMonthly!)} pcm`,
        availableLine:
          from && from.getTime() > Date.now()
            ? `Good news: it's still available, from ${from.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}.`
            : "Good news: it's still available.",
        moveInList: costs.list,
        feesLine: costs.feesLine,
        agentName: agent?.name || agentName || "The Letting Experts",
        link: live ? await passportLink({ name: l.name ?? "", email: (l.email ?? "").trim(), agentId: agent?.id ?? null }) : `${SITE}/tenant/welcome`,
      }),
    });
  }
  return out;
}

/* ── The welcome, for a tenant added by hand ────────────────────────────── */

export async function sendAddedWelcome(p: { contactId: string; name: string; email: string; by: OsUser }): Promise<ReminderResult | null> {
  if (!hasDb()) return null;
  const out: Out = [];
  const dry = !(await automaticOn());
  const book = await liveBook();
  await sendOne(out, dry, {
    key: `tenant-added-welcome:${p.contactId}`,
    emailId: "tenant-added-welcome",
    to: p.email.trim(),
    toName: p.name,
    agent: p.by,
    would: `Would welcome ${p.name}.`,
    vars: async (live) => ({
      firstName: firstName(p.name),
      agentName: p.by.name || "The Letting Experts",
      onNowLine: book.length ? `We have ${book.length} homes on with us right now.` : "",
      link: live ? await passportLink({ name: p.name, email: p.email.trim(), agentId: p.by.id }) : `${SITE}/tenant/welcome`,
    }),
  });
  return out[0] ?? null;
}

/* ── How was it? ───────────────────────────────────────────────────────── */

type ViewingRow = {
  id: string;
  starts_at: Date | string;
  mins: number;
  listing_id: string | null;
  agent: string | null;
  contacts: { name?: string; email?: string | null }[] | null;
  label: string | null;
};

/** "today", "yesterday" or "on Tuesday 15 September", as London sees it. */
function whenSaid(at: Date, now: Date): string {
  const d = london(at).date;
  const today = london(now).date;
  const yesterday = london(new Date(now.getTime() - 86_400_000)).date;
  if (d === today) return "today";
  if (d === yesterday) return "yesterday";
  return `on ${at.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}`;
}

/**
 * Two to twenty-six hours after a TLE viewing ended, to each applicant with an
 * email - unless the agent has recorded it as a no-show, which gets Shall We
 * Rebook? instead. The link is a fresh per-applicant token on
 * os_tenant_feedback, so the page opens on the home they actually saw.
 */
export async function feedbackRequests(dry: boolean, now: Date, out: Out) {
  const rows = await q<ViewingRow>(
    `SELECT v.id, v.starts_at, v.mins, v.listing_id, v.agent, v.contacts, v.payload->>'listingLabel' AS label
       FROM os_viewings v
      WHERE v.kind = 'viewing'
        AND v.cancelled = FALSE
        AND v.payload->>'type' ILIKE 'TLE %Viewing%'
        AND v.starts_at + make_interval(mins => v.mins) BETWEEN $1::timestamptz - interval '26 hours' AND $1::timestamptz - interval '2 hours'
        AND NOT EXISTS (
          SELECT 1 FROM os_viewing_feedback f
           WHERE (f.viewing_id = v.id OR 'rex-' || f.viewing_id = v.id) AND f.attended = FALSE
        )`,
    [now.toISOString()]
  );
  if (!rows.length) return;
  const book = await liveBook();
  const agents = new Map<string, OsUser | null>();
  for (const v of rows) {
    const agentName = (v.agent ?? "").trim();
    if (!agents.has(agentName)) agents.set(agentName, await userByName(agentName));
    const agent = agents.get(agentName) ?? null;
    const listing = findListing(book, v.listing_id);
    const address = v.label || "the property";
    for (const c of v.contacts ?? []) {
      const to = (c.email ?? "").trim();
      await sendOne(out, dry, {
        key: `viewing-feedback:${v.id}:${to.toLowerCase() || c.name}`,
        emailId: "viewing-feedback",
        to,
        toName: c.name ?? "",
        agent,
        would: `Would ask ${c.name ?? to} how ${address} was.`,
        vars: async (live) => {
          let link = `${SITE}/tenant/feedback`;
          if (live) {
            const token = randomBytes(24).toString("base64url");
            const rows = await q<{ token: string }>(
              `INSERT INTO os_tenant_feedback (token, viewing_id, email, name, listing_id, address, asking_pcm, starts_at, agent)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (viewing_id, email) DO UPDATE SET name = EXCLUDED.name
               RETURNING token`,
              [token, v.id, to.toLowerCase(), c.name ?? "", v.listing_id, address, listing?.rentMonthly ? Math.round(listing.rentMonthly) : null, new Date(v.starts_at).toISOString(), agentName || null]
            );
            link = `${SITE}/tenant/feedback?t=${rows[0]?.token ?? token}`;
          }
          return {
            firstName: firstName(c.name ?? ""),
            address,
            viewedOn: whenSaid(new Date(v.starts_at), now),
            agentName: agent?.name || agentName || "The Letting Experts",
            link,
          };
        },
      });
    }
  }
}

/* ── Not that one, try these ───────────────────────────────────────────── */

/** Straight after the tenant says "not this one" on the feedback page. */
export async function sendNotForThem(token: string): Promise<ReminderResult | null> {
  if (!hasDb()) return null;
  const rows = await q<{ viewing_id: string; email: string; name: string; listing_id: string | null; address: string; agent: string | null; answers: Record<string, string> | null }>(
    `SELECT viewing_id, email, name, listing_id, address, agent, answers FROM os_tenant_feedback WHERE token = $1`,
    [token]
  );
  const f = rows[0];
  if (!f) return null;
  const out: Out = [];
  const dry = !(await automaticOn());
  const book = await liveBook();
  const seen = findListing(book, f.listing_id);
  const homes = similarHomes(book, seen ? [seen] : [{ locality: f.address }], { exclude: [f.listing_id ?? ""] });
  const key = `viewing-not-for-them:${f.viewing_id}:${f.email}`;
  if (!homes.length) {
    if (!dry) await logDone(key, "viewing-not-for-them", f.email, "nothing_similar", "No live homes nearby at a similar rent.");
    return { key, emailId: "viewing-not-for-them", to: f.email, subject: "", state: "skipped", detail: "Nothing similar on right now, so nothing was sent." };
  }
  const concern = (f.answers?.concerns ?? "").trim();
  const agent = await userByName(f.agent);
  await sendOne(out, dry, {
    key,
    emailId: "viewing-not-for-them",
    to: f.email,
    toName: f.name,
    agent,
    would: `Would send ${f.name || f.email} ${homes.length} other homes.`,
    vars: async () => ({
      firstName: firstName(f.name),
      address: f.address,
      reasonLine: concern ? `You said: "${esc(concern.length > 160 ? `${concern.slice(0, 157)}...` : concern)}"` : "",
      homesList: homesListHtml(homes),
      agentName: agent?.name || f.agent || "The Letting Experts",
    }),
  });
  return out[0] ?? null;
}

/* ── Shall we rebook? ──────────────────────────────────────────────────── */

/** Two hours to three days after an agent records a no-show. */
export async function rebooks(dry: boolean, out: Out) {
  const rows = await q<{ viewing_id: string; address: string; starts_at: Date | null; by_email: string | null; contacts: { name?: string; email?: string | null }[] | null; label: string | null }>(
    `SELECT f.viewing_id, f.address, f.starts_at, f.by_email, v.contacts, v.payload->>'listingLabel' AS label
       FROM os_viewing_feedback f
       JOIN os_viewings v ON v.id = f.viewing_id OR v.id = 'rex-' || f.viewing_id
      WHERE f.attended = FALSE
        AND f.saved_at BETWEEN NOW() - interval '3 days' AND NOW() - interval '2 hours'`
  );
  for (const r of rows) {
    const agent = r.by_email ? await findUserByEmail(r.by_email).catch(() => null) : null;
    const address = r.label || r.address || "the property";
    for (const c of r.contacts ?? []) {
      const to = (c.email ?? "").trim();
      await sendOne(out, dry, {
        key: `viewing-rebook:${r.viewing_id}:${to.toLowerCase() || c.name}`,
        emailId: "viewing-rebook",
        to,
        toName: c.name ?? "",
        agent,
        would: `Would offer ${c.name ?? to} another time at ${address}.`,
        vars: async () => ({
          firstName: firstName(c.name ?? ""),
          address,
          whenPretty: r.starts_at
            ? `on ${new Date(r.starts_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}`
            : "",
          agentName: agent?.name || "The Letting Experts",
        }),
      });
    }
  }
}

/* ── Anything close? ───────────────────────────────────────────────────── */

type MatchesMeta = { name?: string; agentId?: string | null; homes?: { id?: string }[] };

/**
 * Four to seven days after Homes That Fit went, if they have not been booked
 * on a viewing since and something new has come on near the homes we sent.
 * Nothing new is a real answer: the log says so and nothing is sent.
 */
export async function matchesAgain(dry: boolean, out: Out) {
  const sent = await q<{ key: string; sent_to: string; sent_at: Date; meta: MatchesMeta | null }>(
    `SELECT key, sent_to, sent_at, meta FROM os_tenant_email_log
      WHERE email_id = 'tenant-matches' AND outcome = 'sent'
        AND sent_at BETWEEN NOW() - interval '7 days' AND NOW() - interval '4 days'`
  );
  if (!sent.length) return;
  const book = await liveBook();
  for (const s of sent) {
    const to = s.sent_to.trim();
    const key = `tenant-matches-again:${s.key}`;
    if (await alreadyDone(key)) continue;
    const booked = await q<{ id: string }>(
      `SELECT id FROM os_viewings
        WHERE first_seen > $1 AND contacts @> $2::jsonb LIMIT 1`,
      [s.sent_at, JSON.stringify([{ email: to }])]
    ).catch(() => []);
    if (booked.length) {
      if (!dry) await logDone(key, "tenant-matches-again", to, "booked", "A viewing was booked since, so no follow-up.");
      continue;
    }
    const sentIds = (s.meta?.homes ?? []).map((h) => String(h.id ?? "")).filter(Boolean);
    const like = sentIds.map((id) => findListing(book, id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
    const homes = like.length ? similarHomes(book, like, { exclude: sentIds, since: new Date(s.sent_at) }) : [];
    if (!homes.length) {
      if (!dry) await logDone(key, "tenant-matches-again", to, "nothing_new", "Nothing new near the homes sent.");
      out.push({ key, emailId: "tenant-matches-again", to, subject: "", state: "skipped", detail: "Nothing new has come on near the homes we sent." });
      continue;
    }
    const agent = s.meta?.agentId ? await findUserById(s.meta.agentId).catch(() => null) : null;
    const name = s.meta?.name ?? "";
    await sendOne(out, dry, {
      key,
      emailId: "tenant-matches-again",
      to,
      toName: name,
      agent,
      would: `Would send ${name || to} ${homes.length} new homes.`,
      vars: async (live) => ({
        firstName: firstName(name),
        homesList: homesListHtml(homes),
        agentName: agent?.name || "The Letting Experts",
        link: live ? await passportLink({ name, email: to, agentId: agent?.id ?? null }) : `${SITE}/tenant/welcome`,
      }),
    });
  }
}

/* ── The application: in, and not this one ─────────────────────────────── */

/**
 * Both follow REX's application status. Every (application, status) pair the
 * OS sees is recorded the first time; the very first run records the whole
 * book as a baseline and sends nothing, so switching this on never writes to
 * somebody declined last month.
 *
 *   received      newly seen, and received in the last three days
 *   unsuccessful  newly seen after the baseline
 */
export async function applicationEmails(dry: boolean, out: Out) {
  if (!rexConfigured()) return;
  const apps = await getApplications(300);
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM os_application_status_seen`);
  if (n === 0) {
    if (dry) return; // a dry run must not lay the baseline either
    for (const a of apps) {
      await q(
        `INSERT INTO os_application_status_seen (application_id, status, baseline) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`,
        [a.id, a.status]
      );
    }
    return;
  }

  const book = await liveBook();
  for (const a of apps) {
    if (a.status !== "received" && a.status !== "unsuccessful") continue;
    const known = await q<{ application_id: string }>(
      `SELECT application_id FROM os_application_status_seen WHERE application_id = $1 AND status = $2`,
      [a.id, a.status]
    );
    if (known.length) continue;
    if (a.status === "received") {
      const received = a.dateReceived ? new Date(a.dateReceived).getTime() : (a.createdAt ?? 0) * 1000;
      if (!received || Date.now() - received > 3 * 86_400_000) {
        if (!dry) await q(`INSERT INTO os_application_status_seen (application_id, status) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, a.status]);
        continue;
      }
    }

    /* AGE GUARD on "unsuccessful" (18 Sep sweep, item 13). Tidying a year of
       old applications in REX moves every one to unsuccessful in an afternoon,
       and each was newly seen: every applicant would have been told "no" for
       a home they enquired about last spring. An application received more
       than 60 days ago is closed as housekeeping, and hears nothing. */
    if (a.status === "unsuccessful") {
      const received = a.dateReceived ? new Date(a.dateReceived).getTime() : (a.createdAt ?? 0) * 1000;
      if (!received || Date.now() - received > 60 * 86_400_000) {
        if (!dry) await q(`INSERT INTO os_application_status_seen (application_id, status) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, a.status]);
        continue;
      }
    }

    const listing = findListing(book, a.listingId);
    const scottish = isScottish(listing?.postcode ?? a.locality);
    const address = [a.property, a.locality].filter(Boolean).join(", ");
    const agent = await userByName(a.agent);
    const settled: boolean[] = [];

    for (const person of a.applicants) {
      const to = (person.email ?? "").trim();
      const before = out.length;
      if (a.status === "received") {
        const rent = a.offerAmount ?? listing?.rentMonthly ?? null;
        const bits = [
          a.offerAmount ? `You offered <strong>${pounds(a.offerAmount)} ${a.offerPeriod === "week" ? "pw" : "pcm"}</strong>` : null,
          a.startDate ? `from <strong>${new Date(a.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}</strong>` : null,
          a.agreementMonths ? `for ${a.agreementMonths} months` : null,
        ].filter(Boolean);
        await sendOne(out, dry, {
          key: `application-received:${a.id}:${to.toLowerCase() || person.name}`,
          emailId: "application-received",
          to,
          toName: person.name,
          agent,
          would: `Would tell ${person.name} their application for ${address} is in.`,
          vars: async () => ({
            firstName: firstName(person.name),
            address,
            offerLine: bits.length ? `${bits.join(", ")}.` : "",
            holdingFeeLine: holdingFeeIfYes(rent, scottish),
            agentName: agent?.name || a.agent || "The Letting Experts",
          }),
        });
      } else {
        const homes = similarHomes(book, listing ? [listing] : [{ locality: a.locality, rentMonthly: a.offerAmount }], { exclude: [String(a.listingId ?? "")] });
        await sendOne(out, dry, {
          key: `application-declined:${a.id}:${to.toLowerCase() || person.name}`,
          emailId: "application-declined",
          to,
          toName: person.name,
          agent,
          would: `Would tell ${person.name} the landlord said no to ${address}${homes.length ? `, with ${homes.length} other homes` : ""}.`,
          vars: async () => ({
            firstName: firstName(person.name),
            address,
            reasonLine: "",
            homesList: homes.length ? homesListHtml(homes) : "Nothing close is on with us today, but new homes come on every week and I'll send you anything that fits.",
            agentName: agent?.name || a.agent || "The Letting Experts",
          }),
        });
      }
      const r = out[out.length - 1];
      settled.push(out.length > before ? r.state === "sent" || r.state === "skipped" : true);
    }
    /* Recorded as seen once every applicant is settled (sent, no address, or
       sent on an earlier run). A refused send leaves it unrecorded, so the
       next hour tries again. A dry run records nothing. */
    if (!dry && settled.every(Boolean)) {
      await q(`INSERT INTO os_application_status_seen (application_id, status) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, a.status]);
    }
  }
}
