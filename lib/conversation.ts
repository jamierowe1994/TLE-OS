import "server-only";
import { hasDb, q } from "@/lib/db";
import { conversationWith } from "@/lib/mailbox-read";
import { msAccessTokenFor } from "@/lib/microsoft";
import { smsNumber } from "@/lib/sms";

/**
 * Everything said with one person, as one conversation (10 Oct 2026).
 *
 * James: "any emails that have gone back and forth from that landlord or
 * tenant, and any messages in or out. It should display like a conversation"
 * - email bubbles you can open to read the email and its thread, texts in the
 * same stream. Four sources, read side by side and merged by time:
 *
 *   the agent's own Outlook     both ways, read live (lib/mailbox-read); only
 *                               the signed-in person's own mailbox, never while
 *                               viewing as somebody
 *   the OS's own emails         os_sent_emails - everything the Letting
 *                               Experts sender sent them, with the HTML
 *   texts                       os_sms_log out, os_sms_inbound in
 *   portal chat                 os_landlord_messages / os_tenant_messages, by
 *                               the portal account on their email
 *   calls, WhatsApps, visits    os_lead_touches on the lead, as small lines
 *                               between the bubbles rather than bubbles
 *
 * Nothing is copied: each source is asked when the panel opens.
 */

export type Channel = "email" | "text" | "portal" | "call" | "whatsapp" | "visit";

export interface ConvItem {
  /** "ms:<graph id>", "os:<os_sent_emails id>", "sms:<key>", "smsin:<sid>", "portal:<id>", "touch:<id>". */
  id: string;
  channel: Channel;
  /** in = they wrote to us; out = we wrote to them; event = something that happened. */
  direction: "in" | "out" | "event";
  at: string;
  subject: string;
  text: string;
  /** Who, on our side: the agent, "The Letting Experts" for the OS's own sends. */
  by: string;
  /** Can it be opened for the whole email? */
  openable: boolean;
  link?: string | null;
  unread?: boolean;
}

export interface Conversation {
  ok: true;
  items: ConvItem[];
  /** Why a source said nothing, worth a line in the panel (Outlook not connected, say). */
  notes: string[];
}

const plain = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const TOUCH_WORDS: Record<string, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  visit: "Visit",
};

export async function conversationFor(p: {
  userId: string;
  viewingAs: boolean;
  emails: string[];
  phones: string[];
  leadId?: string | null;
}): Promise<Conversation> {
  const emails = [...new Set(p.emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  const phones = [...new Set(p.phones.map((x) => smsNumber(x)).filter((x): x is string => Boolean(x)))];
  const items: ConvItem[] = [];
  const notes: string[] = [];

  const jobs: Promise<void>[] = [];

  /* Outlook, both ways. */
  if (p.viewingAs) {
    if (emails.length) notes.push("Emails in Outlook are private to the person whose mailbox they are in, so they don't show while you're viewing as somebody.");
  } else {
    for (const email of emails) {
      jobs.push(
        conversationWith(p.userId, email, 40).then((r) => {
          if (!r.ok) {
            notes.push(r.detail);
            return;
          }
          for (const m of r.messages) {
            items.push({
              id: `ms:${m.id}`,
              channel: "email",
              direction: m.direction,
              at: m.at,
              subject: m.subject,
              text: m.preview,
              by: m.direction === "in" ? m.fromName : "You",
              openable: true,
              link: m.link,
              unread: m.unread,
            });
          }
        })
      );
    }
  }

  if (hasDb()) {
    /* The OS's own sender. */
    if (emails.length) {
      jobs.push(
        q<{ id: string; subject: string; html: string; sent_at: string | Date; actor_email: string }>(
          `SELECT id, subject, html, sent_at, actor_email FROM os_sent_emails WHERE lower(to_email) = ANY($1) ORDER BY sent_at DESC LIMIT 60`,
          [emails]
        )
          .then((rows) => {
            for (const r of rows) {
              items.push({
                id: `os:${r.id}`,
                channel: "email",
                direction: "out",
                at: new Date(r.sent_at).toISOString(),
                subject: r.subject || "(no subject)",
                text: plain(r.html).slice(0, 220),
                by: "The Letting Experts",
                openable: true,
              });
            }
          })
          .catch(() => undefined)
      );
    }
    /* Texts. */
    if (phones.length) {
      jobs.push(
        q<{ key: string; body: string; sent_at: string | Date; agent: string | null; kind: string }>(
          `SELECT key, body, sent_at, agent, kind FROM os_sms_log WHERE to_number = ANY($1) AND outcome = 'sent' AND kind <> 'test' ORDER BY sent_at DESC LIMIT 60`,
          [phones]
        )
          .then((rows) => {
            for (const r of rows) {
              items.push({ id: `sms:${r.key}`, channel: "text", direction: "out", at: new Date(r.sent_at).toISOString(), subject: "", text: r.body, by: r.kind === "viewing-1h" ? "Viewing reminder" : "The Letting Experts", openable: false });
            }
          })
          .catch(() => undefined)
      );
      jobs.push(
        q<{ sid: string; body: string; received_at: string | Date }>(
          `SELECT sid, body, received_at FROM os_sms_inbound WHERE from_number = ANY($1) ORDER BY received_at DESC LIMIT 60`,
          [phones]
        )
          .then((rows) => {
            for (const r of rows) {
              items.push({ id: `smsin:${r.sid}`, channel: "text", direction: "in", at: new Date(r.received_at).toISOString(), subject: "", text: r.body, by: "", openable: false });
            }
          })
          .catch(() => undefined)
      );
    }
    /* Their portal chat with us, landlord side and tenant side. */
    if (emails.length) {
      jobs.push(
        q<{ id: string; body: string; direction: string; sent_at: string | Date }>(
          `SELECT m.id, m.body, m.direction, m.sent_at FROM os_landlord_messages m
             JOIN os_portal_accounts a ON a.id = m.account_id
            WHERE a.kind = 'landlord' AND lower(a.email) = ANY($1)
           UNION ALL
           SELECT m.id, m.body, m.direction, m.sent_at FROM os_tenant_messages m
             JOIN os_portal_accounts a ON a.id = m.account_id
            WHERE a.kind = 'tenant' AND lower(a.email) = ANY($1)
           ORDER BY sent_at DESC LIMIT 80`,
          [emails]
        )
          .then((rows) => {
            for (const r of rows) {
              const ours = r.direction === "agent";
              items.push({ id: `portal:${r.id}`, channel: "portal", direction: ours ? "out" : "in", at: new Date(r.sent_at).toISOString(), subject: "", text: r.body, by: "", openable: false });
            }
          })
          .catch(() => undefined)
      );
    }
    /* Calls, WhatsApps and visits logged on the lead. */
    if (p.leadId) {
      jobs.push(
        q<{ id: string; kind: string; outcome: string | null; body: string; by_name: string; at: string | Date }>(
          `SELECT id, kind, outcome, body, by_name, at FROM os_lead_touches WHERE lead_id = $1 AND kind = ANY($2) ORDER BY at DESC LIMIT 60`,
          [p.leadId, Object.keys(TOUCH_WORDS)]
        )
          .then((rows) => {
            for (const r of rows) {
              const outcome = (r.outcome ?? "").replace(/_/g, " ");
              items.push({
                id: `touch:${r.id}`,
                channel: r.kind as Channel,
                direction: "event",
                at: new Date(r.at).toISOString(),
                subject: "",
                text: [TOUCH_WORDS[r.kind], outcome ? `- ${outcome}` : "", r.body ? `· ${r.body}` : ""].filter(Boolean).join(" "),
                by: r.by_name,
                openable: false,
              });
            }
          })
          .catch(() => undefined)
      );
    }
  }

  await Promise.all(jobs);

  /* The OS's own email can also sit in the agent's Sent Items when it went
     out as them: one bubble, the Outlook one, which has the thread. */
  const seen = new Set(items.filter((i) => i.id.startsWith("ms:")).map((i) => `${i.subject.toLowerCase()}|${i.at.slice(0, 16)}`));
  const merged = items.filter((i) => !(i.id.startsWith("os:") && seen.has(`${i.subject.toLowerCase()}|${i.at.slice(0, 16)}`)));
  merged.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { ok: true, items: merged, notes: [...new Set(notes)] };
}

export interface FullEmail {
  subject: string;
  from: string;
  to: string;
  at: string;
  html: string;
  link: string | null;
  /** The rest of the thread, oldest first, this one included. */
  thread: { id: string; from: string; at: string; preview: string; current: boolean }[];
}

/** One email in full: an OS send from os_sent_emails, or one from the agent's own Outlook with its thread. */
export async function openEmail(userId: string, viewingAs: boolean, id: string, allowed: string[]): Promise<FullEmail | { error: string }> {
  const allow = allowed.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (id.startsWith("os:")) {
    const rows = await q<{ to_email: string; subject: string; html: string; sent_at: string | Date }>(`SELECT to_email, subject, html, sent_at FROM os_sent_emails WHERE id = $1`, [id.slice(3)]).catch(() => []);
    const r = rows[0];
    if (!r || !allow.includes(r.to_email.trim().toLowerCase())) return { error: "That email isn't on this record." };
    return { subject: r.subject, from: "The Letting Experts", to: r.to_email, at: new Date(r.sent_at).toISOString(), html: r.html, link: null, thread: [] };
  }
  if (!id.startsWith("ms:")) return { error: "That isn't an email." };
  if (viewingAs) return { error: "Emails are private to the person whose mailbox they are in." };
  let token: string;
  try {
    token = await msAccessTokenFor(userId);
  } catch {
    return { error: "Connect your Outlook on your Profile to open emails here." };
  }
  const G = "https://graph.microsoft.com/v1.0/me/messages";
  type Msg = {
    id: string; subject?: string; conversationId?: string; webLink?: string; bodyPreview?: string;
    body?: { contentType?: string; content?: string };
    from?: { emailAddress?: { name?: string; address?: string } };
    toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
    ccRecipients?: { emailAddress?: { address?: string } }[];
    sentDateTime?: string; receivedDateTime?: string;
  };
  const res = await fetch(`${G}/${encodeURIComponent(id.slice(3))}?$select=subject,body,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,conversationId,webLink`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return { error: "Outlook didn't hand that email over just now." };
  const m = (await res.json()) as Msg;
  /* Only an email with this person in it opens from their record. */
  const people = [m.from?.emailAddress?.address, ...(m.toRecipients ?? []).map((x) => x.emailAddress?.address), ...(m.ccRecipients ?? []).map((x) => x.emailAddress?.address)]
    .map((x) => (x ?? "").toLowerCase());
  if (!people.some((x) => allow.includes(x))) return { error: "That email isn't on this record." };

  let thread: FullEmail["thread"] = [];
  if (m.conversationId) {
    const t = await fetch(`${G}?$filter=${encodeURIComponent(`conversationId eq '${m.conversationId.replace(/'/g, "''")}'`)}&$select=id,from,sentDateTime,receivedDateTime,bodyPreview&$top=30`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const tj = t?.ok ? ((await t.json()) as { value?: Msg[] }) : { value: [] };
    thread = (tj.value ?? [])
      .map((x) => ({
        id: `ms:${x.id}`,
        from: x.from?.emailAddress?.name || x.from?.emailAddress?.address || "",
        at: x.receivedDateTime ?? x.sentDateTime ?? "",
        preview: (x.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        current: x.id === m.id,
      }))
      .sort((a, b) => (a.at < b.at ? -1 : 1));
  }
  const body = m.body?.content ?? "";
  return {
    subject: m.subject ?? "(no subject)",
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
    to: (m.toRecipients ?? []).map((x) => x.emailAddress?.name || x.emailAddress?.address).filter(Boolean).join(", "),
    at: m.receivedDateTime ?? m.sentDateTime ?? "",
    html: m.body?.contentType === "text" ? `<pre style="white-space:pre-wrap;font-family:inherit">${body.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` : body,
    link: m.webLink ?? null,
    thread: thread.length > 1 ? thread : [],
  };
}
