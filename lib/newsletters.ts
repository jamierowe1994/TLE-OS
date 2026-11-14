/**
 * Newsletters and event emails, from Marketing (James, 30 Sep 2026).
 *
 * "She clicks Create email, it brings up a canvas like Mailchimp ... she'll
 * then be able to publish it, set up a send schedule, and set who it goes out
 * to. It will bring through the list of all agents, signed up or not."
 *
 * ── How the pieces fit ────────────────────────────────────────────────────
 *
 *   design     the block builder (components/EmailBuilder) - the same one the
 *              automatic emails use, drawn by the sending renderer, so what
 *              she sees on the canvas is what arrives
 *   who        chosen by hand from audience(): every lettings agent in REX and
 *              everybody with an OS account or invite, marked signed up or not
 *   when       now, or a London date and time
 *   send       runNewsletters(), called by the five-minute queue runner
 *              (/api/scheduled-sends/run). One row per recipient in
 *              os_newsletter_sends, so a run that stops half way resumes and
 *              nobody gets it twice.
 *
 * ── The guards, all of them deliberate ────────────────────────────────────
 *
 *   - A TEAM EMAIL IS STAFF ONLY. Sent with audience "internal", so
 *     lib/resend refuses any address outside our own domains. It can never
 *     reach a landlord, whatever ends up on the list.
 *   - HELD until the `newsletter_sending` switch is armed (James's, in
 *     Admin > Switches). Published emails wait at their time, marked Held.
 *
 * ── Mail-outs to landlords and tenants (James, 14 Nov 2026) ───────────────
 *
 * The same email with `audience` "customers". It names live lists
 * (lib/mail-lists) instead of people, and the people are worked out the
 * moment it starts to send. It goes from the address Marketing set
 * (lib/mail-sender), in the customer look, with an unsubscribe nobody can
 * remove, and it has guards of its own:
 *
 *   - HELD until BOTH `customer_email` and `marketing_mailouts` are armed.
 *   - PACED: a set number a day, climbing over the first week of sending
 *     (lib/mail-sender), so a big list goes over a few days.
 *   - DAYTIME ONLY: copies leave between 8am and 8pm, UK time.
 *   - Anybody who has unsubscribed, bounced or complained is left out when
 *     the list is worked out and again as their copy would leave.
 *   - NOT STALE. An email held more than a day past its time is marked
 *     Missed rather than sent late - "Tomorrow at 9" arriving on Friday is
 *     worse than not arriving.
 */

import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { renderNewsletter } from "@/lib/newsletter-render";
export { renderNewsletter };
import { isInternalAddress } from "@/lib/email-policy";
import { lettingsAgents } from "@/lib/rex-agents";
import { invites } from "@/lib/pilot";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { switchOn } from "@/lib/switches";
import { newTrackToken, trackHtml } from "@/lib/newsletter-track";
import { assetOrigin } from "@/lib/campaign-mail";
import { isListId, peopleOn, type ListId } from "@/lib/mail-lists";
import { fromLine, getMailSender, mailoutPace } from "@/lib/mail-sender";
import { isOptedOut, unsubscribeUrl } from "@/lib/mail-optout";
import { londonParts } from "@/lib/london-time";

export type NewsletterKind = "newsletter" | "event";
export type NewsletterStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "missed";
export type Recipient = { email: string; name: string };
/** "team" is a staff newsletter; "customers" is a mail-out to landlord and tenant lists. */
export type NewsletterAudience = "team" | "customers";

export type Newsletter = {
  id: string;
  kind: NewsletterKind;
  name: string;
  subject: string;
  preheader: string;
  blocks: Record<string, unknown>[];
  recipients: Recipient[];
  audience: NewsletterAudience;
  /** The live lists a mail-out goes to (lib/mail-lists). Empty for a team email. */
  lists: ListId[];
  sendAt: string | null;
  status: NewsletterStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  finishedAt: string | null;
  /** Per-recipient progress, once sending has begun. */
  progress?: { sent: number; failed: number; queued: number };
};

/* How long a held email may wait past its time before it is Missed instead. */
const STALE_MS = 24 * 60 * 60 * 1000;
/* Sends per run. Resend allows a couple of requests a second, and the queue
   runner comes back every five minutes, so a whole-company list takes two
   or three runs rather than one long request. */
const PER_RUN = 40;
const GAP_MS = 550;
/* A mail-out goes slower: 20 every five minutes is 240 an hour, inside what
   the sending service suggests for a domain that is still warming up. */
const PER_RUN_CUSTOMERS = 20;
/* Marketing email at 3am reads as spam. UK hours, 8am up to 8pm. */
const DAY_STARTS = 8;
const DAY_ENDS = 20;

let seq = 0;
const bid = () => `nl_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/* ── Where each kind starts ──────────────────────────────────────────────── */

/**
 * The canvas a new email opens on. Placeholder words she types over, in the
 * house style: Title Case headings, no invented straplines, no em dashes.
 * No logo block: the letterhead already carries the logo at the top.
 */
export function starterBlocks(kind: NewsletterKind): Record<string, unknown>[] {
  if (kind === "event") {
    return [
      { type: "heading", id: bid(), text: "You're Invited", align: "center", color: "" },
      { type: "text", id: bid(), text: "Hi {{firstName}}, we would love to see you there. Everything you need is below.", bg: "", align: "center" },
      { type: "divider", id: bid(), color: "#E7E2DE" },
      { type: "text", id: bid(), text: "<b>When:</b> Thursday 15 October, 6pm<br><b>Where:</b> The Letting Experts office<br><b>Dress code:</b> Smart casual", bg: "" },
      { type: "button", id: bid(), text: "Save My Place", url: "mailto:hello@thelettingexperts.co.uk?subject=I'll%20be%20there", color: "", align: "center" },
      { type: "text", id: bid(), text: "Any questions, just reply to this email.", bg: "", align: "center" },
    ];
  }
  return [
    { type: "heading", id: bid(), text: "The Month at TLE", align: "left", color: "" },
    { type: "text", id: bid(), text: "Hi {{firstName}}, here is what has been happening, and what is coming up.", bg: "" },
    { type: "heading", id: bid(), text: "First Story", align: "left", color: "", size: 20 },
    { type: "text", id: bid(), text: "A few lines on the first thing worth knowing. Drag in a picture from the left to bring it to life.", bg: "" },
    { type: "button", id: bid(), text: "Find Out More", url: "https://tle-os.co.uk", color: "", align: "left" },
    { type: "divider", id: bid(), color: "#E7E2DE" },
    { type: "heading", id: bid(), text: "Second Story", align: "left", color: "", size: 20 },
    { type: "text", id: bid(), text: "And the next one. Delete anything you do not need.", bg: "" },
  ];
}

export const STARTER_SUBJECT: Record<NewsletterKind, string> = {
  newsletter: "The Month at TLE",
  event: "You're Invited",
};

/* ── Rendering ─────────────────────────────────────────────────────────────
   In lib/newsletter-render, which has no server imports, so the studio's
   preview in the browser runs exactly the code that sends. */

/* ── Who it can go to ────────────────────────────────────────────────────── */

export type Person = {
  email: string;
  name: string;
  /** Has an OS account. The list she asked for shows both. */
  signedUp: boolean;
  /** A lettings agent on REX, as opposed to office staff. */
  agent: boolean;
};

/**
 * Everybody a newsletter could go to: every active lettings agent on REX, and
 * everyone with an OS account or an invite (marketing, ops, head office).
 * Our own domains only, because nothing else would be allowed to send.
 */
export async function audience(): Promise<Person[]> {
  const byEmail = new Map<string, Person>();
  const add = (email: string, name: string, patch: Partial<Person>) => {
    const key = email.trim().toLowerCase();
    if (!key.includes("@") || !isInternalAddress(key)) return;
    const had = byEmail.get(key);
    byEmail.set(key, {
      email: key,
      name: had?.name || name.trim() || key.split("@")[0],
      signedUp: Boolean(had?.signedUp || patch.signedUp),
      agent: Boolean(had?.agent || patch.agent),
    });
  };

  for (const a of await lettingsAgents().catch(() => [])) add(a.email, a.name, { agent: true });
  if (hasDb()) {
    const users = await q<{ email: string; name: string | null; role: string | null }>(
      `select email, name, role from os_users`
    ).catch(() => []);
    for (const u of users) add(u.email, u.name ?? "", { signedUp: true, agent: u.role === "agent" });
    for (const i of await invites().catch(() => [])) add(i.email, i.name ?? "", {});
  }
  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

type Row = {
  id: string; kind: string; name: string; subject: string; preheader: string;
  blocks: unknown; recipients: unknown; audience: string | null; lists: unknown; send_at: Date | null; status: string;
  created_by: string; created_at: Date; updated_at: Date;
  published_by: string | null; published_at: Date | null; finished_at: Date | null;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function fromRow(r: Row): Newsletter {
  return {
    id: r.id,
    kind: r.kind === "event" ? "event" : "newsletter",
    name: r.name,
    subject: r.subject,
    preheader: r.preheader,
    blocks: Array.isArray(r.blocks) ? (r.blocks as Record<string, unknown>[]) : [],
    recipients: Array.isArray(r.recipients) ? (r.recipients as Recipient[]) : [],
    audience: r.audience === "customers" ? "customers" : "team",
    lists: Array.isArray(r.lists) ? (r.lists as unknown[]).filter(isListId) : [],
    sendAt: iso(r.send_at),
    status: r.status as NewsletterStatus,
    createdBy: r.created_by,
    createdAt: iso(r.created_at) as string,
    updatedAt: iso(r.updated_at) as string,
    publishedBy: r.published_by,
    publishedAt: iso(r.published_at),
    finishedAt: iso(r.finished_at),
  };
}

async function progressFor(ids: string[]): Promise<Map<string, { sent: number; failed: number; queued: number }>> {
  const out = new Map<string, { sent: number; failed: number; queued: number }>();
  if (!ids.length) return out;
  const rows = await q<{ newsletter_id: string; state: string; n: string }>(
    `select newsletter_id, state, count(*)::text as n from os_newsletter_sends
      where newsletter_id = any($1) group by newsletter_id, state`,
    [ids]
  );
  for (const r of rows) {
    const p = out.get(r.newsletter_id) ?? { sent: 0, failed: 0, queued: 0 };
    if (r.state === "sent") p.sent += Number(r.n);
    else if (r.state === "failed") p.failed += Number(r.n);
    else if (r.state === "queued") p.queued += Number(r.n);
    out.set(r.newsletter_id, p);
  }
  return out;
}

export async function listNewsletters(): Promise<Newsletter[]> {
  const rows = await q<Row>(`select * from os_newsletters where status <> 'cancelled' or updated_at > now() - interval '30 days' order by updated_at desc limit 200`);
  const list = rows.map(fromRow);
  const prog = await progressFor(list.map((n) => n.id));
  return list.map((n) => ({ ...n, progress: prog.get(n.id) }));
}

export async function getNewsletter(id: string): Promise<Newsletter | null> {
  const rows = await q<Row>(`select * from os_newsletters where id = $1`, [id]);
  if (!rows[0]) return null;
  const n = fromRow(rows[0]);
  return { ...n, progress: (await progressFor([id])).get(id) };
}

export async function createNewsletter(kind: NewsletterKind, by: string): Promise<Newsletter> {
  const id = randomUUID();
  const name = kind === "event" ? "New event" : "New newsletter";
  await q(
    `insert into os_newsletters (id, kind, name, subject, blocks, created_by) values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [id, kind, name, STARTER_SUBJECT[kind], JSON.stringify(starterBlocks(kind)), by]
  );
  return (await getNewsletter(id)) as Newsletter;
}

export class NewsletterError extends Error {}

/**
 * Duplicate: a fresh draft with the same design, subject, inbox line and list
 * (Francesca, 1 Oct 2026). Works from any email, sent ones included, so last
 * month's newsletter can be the start of this month's. Nothing about how the
 * original went is carried over: no send time, no sends, no results.
 */
export async function duplicateNewsletter(id: string, by: string): Promise<Newsletter> {
  const n = await getNewsletter(id);
  if (!n) throw new NewsletterError("That email no longer exists.");
  const copy = randomUUID();
  await q(
    `insert into os_newsletters (id, kind, name, subject, preheader, blocks, recipients, created_by, audience, lists)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb)`,
    [copy, n.kind, `${n.name || "Untitled"} (copy)`.slice(0, 200), n.subject, n.preheader, JSON.stringify(n.blocks), JSON.stringify(n.recipients), by, n.audience, JSON.stringify(n.lists)]
  );
  return (await getNewsletter(copy)) as Newsletter;
}

/** Anything still editable. Once it is sending or sent, it is history. */
export async function updateNewsletter(
  id: string,
  patch: Partial<Pick<Newsletter, "name" | "subject" | "preheader" | "blocks" | "recipients" | "sendAt" | "audience" | "lists">>
): Promise<Newsletter> {
  const n = await getNewsletter(id);
  if (!n) throw new NewsletterError("That email no longer exists.");
  if (n.status !== "draft") throw new NewsletterError("It has been published. Unpublish it first to change it.");
  const recipients = patch.recipients?.map((r) => ({ email: r.email.trim().toLowerCase(), name: (r.name ?? "").trim() }));
  await q(
    `update os_newsletters set
        name = coalesce($2, name), subject = coalesce($3, subject), preheader = coalesce($4, preheader),
        blocks = coalesce($5::jsonb, blocks), recipients = coalesce($6::jsonb, recipients),
        send_at = case when $7::boolean then $8::timestamptz else send_at end,
        audience = coalesce($9, audience), lists = coalesce($10::jsonb, lists),
        updated_at = now()
      where id = $1`,
    [
      id,
      patch.name ?? null,
      patch.subject ?? null,
      patch.preheader ?? null,
      patch.blocks ? JSON.stringify(patch.blocks) : null,
      recipients ? JSON.stringify(recipients) : null,
      patch.sendAt !== undefined,
      patch.sendAt ?? null,
      patch.audience === "customers" || patch.audience === "team" ? patch.audience : null,
      patch.lists ? JSON.stringify(patch.lists.filter(isListId)) : null,
    ]
  );
  return (await getNewsletter(id)) as Newsletter;
}

export async function deleteNewsletter(id: string): Promise<void> {
  const n = await getNewsletter(id);
  if (n && n.status !== "draft") throw new NewsletterError("Only a draft can be deleted. Unpublish it first.");
  await q(`delete from os_newsletters where id = $1`, [id]);
}

/**
 * Published: it will go at `sendAt` (or on the next run, if that is now).
 * Everything is checked here so a mistake is caught while she is looking at
 * it, not five minutes later in a log.
 */
export async function publishNewsletter(id: string, sendAt: Date, by: string): Promise<Newsletter> {
  const n = await getNewsletter(id);
  if (!n) throw new NewsletterError("That email no longer exists.");
  if (n.status !== "draft") throw new NewsletterError("It is already published.");
  if (!n.subject.trim()) throw new NewsletterError("Give it a subject line first.");
  if (!n.blocks.length) throw new NewsletterError("The email is empty. Design it first.");
  /* A mail-out names lists, not people: who is on them is worked out when it
     sends. Checked now that there is somebody, and an address to send from. */
  if (n.audience === "customers") {
    if (!n.lists.length) throw new NewsletterError("Pick at least one list first.");
    if (!(await getMailSender())) throw new NewsletterError("Set the address it comes from first.");
    if (!(await peopleOn(n.lists)).length) throw new NewsletterError("Nobody is on the lists picked.");
  }
  const valid = n.audience === "customers" ? [] : n.recipients.filter((r) => isInternalAddress(r.email));
  if (n.audience !== "customers" && !valid.length) throw new NewsletterError("Pick who it goes to first.");
  if (Number.isNaN(sendAt.getTime())) throw new NewsletterError("That send time is not a real date.");
  if (sendAt.getTime() < Date.now() - 5 * 60 * 1000) throw new NewsletterError("That time has already passed. Pick a later one, or Send now.");
  await q(
    `update os_newsletters set status = 'scheduled', send_at = $2, recipients = $3::jsonb,
        published_by = $4, published_at = now(), updated_at = now() where id = $1 and status = 'draft'`,
    [id, sendAt.toISOString(), JSON.stringify(valid), by]
  );
  return (await getNewsletter(id)) as Newsletter;
}

/** Back to a draft, as long as nothing has gone yet. */
export async function unpublishNewsletter(id: string): Promise<Newsletter> {
  const n = await getNewsletter(id);
  if (!n) throw new NewsletterError("That email no longer exists.");
  if (n.status !== "scheduled" && n.status !== "missed") {
    throw new NewsletterError(n.status === "draft" ? "It is not published." : "It has already started sending.");
  }
  await q(`update os_newsletters set status = 'draft', published_at = null, published_by = null, updated_at = now() where id = $1 and status in ('scheduled','missed')`, [id]);
  return (await getNewsletter(id)) as Newsletter;
}

/** One copy to the person asking, marked [Test]. Not behind the switch. */
export async function sendTest(id: string, to: Recipient): Promise<void> {
  const n = await getNewsletter(id);
  if (!n) throw new NewsletterError("That email no longer exists.");
  if (n.audience === "customers") {
    /* As a landlord or tenant would get it: the customer look, the marketing
       address, and a working unsubscribe link for the tester's own address. */
    const sender = await getMailSender();
    if (!sender) throw new NewsletterError("Set the address it comes from first, then send the test.");
    const unsub = unsubscribeUrl(assetOrigin(), to.email, n.id);
    const mail = renderNewsletter(n, to, { unsubscribeUrl: unsub });
    await sendEmail({
      to: to.email,
      subject: `[Test] ${mail.subject}`,
      html: mail.html,
      ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      mailout: { from: fromLine(sender), unsubscribeUrl: unsub },
    });
    return;
  }
  const mail = renderNewsletter(n, to);
  await sendEmail({ to: to.email, subject: `[Test] ${mail.subject}`, html: mail.html, audience: "internal" });
}

/* ── The sender ──────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Due emails, a slice at a time. Called by the five-minute queue runner.
 * Returns what it did, for the runner's response and the logs.
 */
export async function runNewsletters(): Promise<{ held: number; missed: number; sent: number; failed: number; finished: number }> {
  const out = { held: 0, missed: 0, sent: 0, failed: 0, finished: 0 };
  if (!hasDb()) return out;

  const due = await q<{ id: string; send_at: Date; status: string; audience: string | null }>(
    `select id, send_at, status, audience from os_newsletters
      where status in ('scheduled','sending') and send_at <= now() order by send_at limit 10`
  );
  if (!due.length) return out;

  const teamArmed = await switchOn("newsletter_sending");
  /* Looked up once, and only if a mail-out is due. */
  const anyMailout = due.some((d) => d.audience === "customers");
  const mailoutArmed = anyMailout ? await mailoutsArmed() : false;
  const sender = anyMailout ? await getMailSender() : null;
  const hour = londonParts(Date.now()).hour;
  const daytime = hour >= DAY_STARTS && hour < DAY_ENDS;
  /* Today's allowance, shared by every mail-out due and counted down as copies go. */
  let allowance = anyMailout ? (await mailoutPace()).left : 0;

  for (const d of due) {
    const customers = d.audience === "customers";
    const armed = customers ? mailoutArmed && Boolean(sender) : teamArmed;
    if (d.status === "scheduled") {
      if (Date.now() - new Date(d.send_at).getTime() > STALE_MS) {
        await q(`update os_newsletters set status = 'missed', updated_at = now() where id = $1 and status = 'scheduled'`, [d.id]);
        out.missed += 1;
        continue;
      }
      /* A mail-out due at night starts in the morning: it is not late, so it
         is not Missed, as long as that is within the day it was meant for. */
      if (!armed || (customers && !daytime)) {
        out.held += 1;
        continue;
      }
      /* The lists are read before it is claimed: if the book cannot be read
         right now it stays scheduled and the next run tries again, rather
         than going out to nobody and calling itself sent. */
      let onLists: Array<{ email: string; name: string; list: string }> = [];
      if (customers) {
        const listIds = await q<{ lists: unknown }>(`select lists from os_newsletters where id = $1`, [d.id]);
        const ids = Array.isArray(listIds[0]?.lists) ? (listIds[0].lists as unknown[]).filter(isListId) : [];
        try {
          onLists = await peopleOn(ids, true);
        } catch {
          out.held += 1;
          continue;
        }
        if (!onLists.length) {
          out.held += 1;
          continue;
        }
      }
      /* Claimed, and the list frozen into rows, in one go: a second runner
         arriving now finds it already 'sending'. */
      const claimed = await q<{ id: string }>(
        `update os_newsletters set status = 'sending', updated_at = now() where id = $1 and status = 'scheduled' returning id`,
        [d.id]
      );
      if (!claimed.length) continue;
      if (customers) {
        /* Who is on the lists NOW - the point of a live list. */
        await q(
          `insert into os_newsletter_sends (newsletter_id, email, name, list)
           select $1, r->>'email', coalesce(r->>'name',''), r->>'list' from jsonb_array_elements($2::jsonb) r
           on conflict do nothing`,
          [d.id, JSON.stringify(onLists.map((p) => ({ email: p.email, name: p.name, list: p.list })))]
        );
      } else {
        await q(
          `insert into os_newsletter_sends (newsletter_id, email, name)
           select $1, lower(r->>'email'), coalesce(r->>'name','') from os_newsletters n, jsonb_array_elements(n.recipients) r
            where n.id = $1
           on conflict do nothing`,
          [d.id]
        );
      }
    } else if (!armed || (customers && !daytime)) {
      /* Switched off half way, or the evening has come: the rest waits, nothing is lost. */
      out.held += 1;
      continue;
    }

    const n = await getNewsletter(d.id);
    if (!n) continue;
    const limit = customers ? Math.min(PER_RUN_CUSTOMERS, allowance) : PER_RUN;
    if (limit <= 0) {
      /* Today's allowance has gone. It carries on tomorrow morning. */
      out.held += 1;
      continue;
    }
    const batch = await q<{ email: string; name: string }>(
      `select email, name from os_newsletter_sends where newsletter_id = $1 and state = 'queued' order by email limit $2`,
      [d.id, limit]
    );
    for (const r of batch) {
      try {
        /* Unsubscribed since the list was read: left out, and recorded as such. */
        if (customers && (await isOptedOut(r.email))) {
          await q(`update os_newsletter_sends set state = 'skipped', error = 'Unsubscribed' where newsletter_id = $1 and email = $2`, [d.id, r.email]);
          continue;
        }
        const unsub = customers ? unsubscribeUrl(assetOrigin(), r.email, d.id) : "";
        const mail = renderNewsletter(n, r, customers ? { unsubscribeUrl: unsub } : {});
        /* Each copy gets its own token for the open pixel and the links
           (lib/newsletter-track), kept if a retry comes round again. */
        const tok = await q<{ token: string }>(
          `update os_newsletter_sends set token = coalesce(token, $3) where newsletter_id = $1 and email = $2 returning token`,
          [d.id, r.email, newTrackToken()]
        );
        const html = tok[0]?.token ? trackHtml(mail.html, tok[0].token, assetOrigin()) : mail.html;
        const res =
          customers && sender
            ? await sendEmail({
                to: r.email,
                subject: mail.subject,
                html,
                ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
                mailout: { from: fromLine(sender), unsubscribeUrl: unsub },
              })
            : await sendEmail({ to: r.email, subject: mail.subject, html, audience: "internal" });
        await q(
          `update os_newsletter_sends set state = 'sent', sent_at = now(), error = null, resend_id = $3 where newsletter_id = $1 and email = $2`,
          [d.id, r.email, res?.id ?? null]
        );
        out.sent += 1;
        if (customers) allowance -= 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        /* Not sendable right now (unlocked or throttled): stop, and the next
           run carries on. Anything else is about this one address. */
        /* One address the sending service turns down (400, 422) is about that
           address: it fails by itself and the rest carry on, or one mistyped
           email at the top of a list of thousands would hold it for ever. */
        const oneAddress = /^Resend said 4(00|22)\b/.test(msg) && !/429|rate/i.test(msg);
        if ((e instanceof ResendBlocked && !oneAddress) || /429|rate/i.test(msg)) {
          out.held += 1;
          break;
        }
        await q(`update os_newsletter_sends set state = 'failed', error = $3 where newsletter_id = $1 and email = $2`, [d.id, r.email, msg.slice(0, 500)]);
        out.failed += 1;
      }
      await sleep(GAP_MS);
    }
    const left = await q<{ n: string }>(`select count(*)::text as n from os_newsletter_sends where newsletter_id = $1 and state = 'queued'`, [d.id]);
    if (Number(left[0]?.n ?? 0) === 0) {
      await q(`update os_newsletters set status = 'sent', finished_at = now(), updated_at = now() where id = $1 and status = 'sending'`, [d.id]);
      out.finished += 1;
    }
  }
  return out;
}

/** Both switches a mail-out needs: email to customers at all, and mail-outs themselves. */
export async function mailoutsArmed(): Promise<boolean> {
  return (await switchOn("customer_email")) && (await switchOn("marketing_mailouts"));
}

/** Whether a published email will actually go, for the screen. */
export async function sendingArmed(): Promise<boolean> {
  return switchOn("newsletter_sending");
}
