import "server-only";
import type { AssistantTool } from "@/lib/assistant-tools";
import { msAccessTokenFor, MailboxNotConnected } from "@/lib/microsoft";
import { isInternalAddress } from "@/lib/email-policy";
import { searchEverything, type Hit } from "@/lib/search";
import { listAppraisals } from "@/lib/appraisal-store";

/**
 * "CAN YOU CHECK MY EMAILS THIS MORNING" (Gurdeep Singh, 14 Oct 2026).
 *
 * He was told Steve was blind to his inbox. He was not: every agent gave the
 * OS Mail.Read when they connected Microsoft (lib/microsoft SCOPES), and
 * lib/mailbox-read already reads one conversation out of it for a lead's
 * file. This reads the INBOX for a window and hands Steve what an agent would
 * pick out first: customers writing about their leads, homes and lets, what
 * has had no reply, and anything that reads urgent, each with the OS file it
 * belongs to.
 *
 * ── Read only, and only theirs ───────────────────────────────────────────
 *
 * GETs, nothing else. A Graph GET does not mark a message read, and there is
 * no send, move, delete or flag call anywhere in this file - so "check my
 * emails" can never tidy somebody's inbox behind their back. The token is the
 * signed-in person's own (ctx.me, from the session); there is no input that
 * names a mailbox, so nobody can ask Steve to read somebody else's. An owner
 * viewing as an agent is refused: seeing their screen is not reading their
 * post (the same rule as lib/mailbox-read's route).
 *
 * Bodies are not kept. The preview line goes to the model for this one answer
 * and is not written anywhere.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type GraphMail = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isRead?: boolean;
  importance?: string;
  webLink?: string;
  conversationId?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  inferenceClassification?: string;
  hasAttachments?: boolean;
  flag?: { flagStatus?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
};

/** Words that mean somebody needs an answer today, in the words customers use. */
const URGENT = [
  /\burgent(ly)?\b/i, /\basap\b/i, /\bemergency\b/i, /\bleak(ing)?\b/i, /\bflood(ed|ing)?\b/i,
  /\bno (heating|hot water|power|electric(ity)?)\b/i, /\bgas (smell|leak)\b/i, /\bsmell of gas\b/i,
  /\bboiler\b/i, /\blocked out\b/i, /\bbroken in(to)?\b/i, /\bburst\b/i, /\bmould\b/i,
  /\bcomplain(t|ing)?\b/i, /\bsolicitor\b/i, /\bdeadline\b/i, /\btoday\b/i, /\bchase|chasing\b/i,
  /\bstill (waiting|not heard)\b/i, /\bnot happy\b/i, /\bunacceptable\b/i,
];

/** Mail nobody needs summarising: no-reply senders and bulk "Other" mail. */
function automated(m: GraphMail): boolean {
  const from = (m.from?.emailAddress?.address ?? "").toLowerCase();
  if (/(^|[.+_-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon|newsletter|marketing|updates?)@/.test(from)) return true;
  return m.inferenceClassification === "other";
}

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Outlook refused (${res.status}).`);
  return (await res.json()) as T;
}

const when = (iso: string | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })
    : "not recorded";

/** The OS file a sender belongs to, from the same search the search bar uses -
 *  and only their own records: leads, applications, lets and homes. A person we
 *  merely remember from REX is not a file of theirs. */
function fileFrom(hits: Hit[]): { label: string; href: string; what: string } | null {
  const h = hits.find((x) => x.kind === "lead" || x.kind === "application" || x.kind === "deal" || x.kind === "property");
  if (!h) return null;
  const what = h.kind === "lead" ? "their lead" : h.kind === "application" ? "their application" : h.kind === "deal" ? "the let" : "the home";
  return { label: h.kind === "lead" ? h.title : h.title, href: h.href, what };
}

export const checkMyEmails: AssistantTool = {
  name: "check_my_emails",
  description:
    "Read the signed-in person's OWN Outlook inbox and pick out what matters: customers writing about their leads, homes and lets, emails with no reply yet, and anything urgent, each matched to its OS file. Call it for 'check my emails', 'anything in my inbox', 'have I missed anything', 'who's emailed me'. Read only: it never sends, replies, deletes, moves or marks anything as read, and it can only ever read their own mailbox. Summarise in short lines, most urgent first, each with a link to its OS file when there is one; never quote whole emails.",
  input_schema: {
    type: "object",
    properties: {
      hours: {
        type: "number",
        description: "How far back to look, in hours. Default 24. 'This morning' after a weekend: 72. At most 168 (a week).",
      },
    },
    required: [],
  },
  label: () => "Reading your inbox…",
  async run(input, ctx) {
    if (!ctx.me?.id) return { error: "I can't tell who you are, so I won't open a mailbox." };
    if (ctx.viewingAs) {
      return { error: "You are viewing the OS as somebody else. Seeing their screen is not reading their email, so I won't open their inbox - or yours under their name. Stop viewing as them and ask me again." };
    }
    const hours = Math.min(168, Math.max(1, typeof input.hours === "number" && Number.isFinite(input.hours) ? Math.round(input.hours) : 24));
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();

    let token: string;
    try {
      token = await msAccessTokenFor(ctx.me.id);
    } catch (e) {
      return e instanceof MailboxNotConnected
        ? {
            notConnected: true,
            note: "Their Microsoft mailbox is not connected to the OS, so there is nothing to read. Tell them how: [Profile](/profile?tab=connections), the Connections tab, then Connect on the Microsoft 365 tile and sign in with their work account. Once it says Live, ask again.",
          }
        : { error: "Outlook didn't answer just now. Try again in a minute." };
    }

    /* The inbox for the window, newest first, and what they sent in the same
       window, to tell answered from not. Both are reads. */
    const inboxQ = new URLSearchParams({
      $filter: `receivedDateTime ge ${since}`,
      $orderby: "receivedDateTime desc",
      $top: "60",
      $select: "id,subject,from,receivedDateTime,bodyPreview,isRead,importance,webLink,conversationId,inferenceClassification,hasAttachments,flag",
    });
    const sentQ = new URLSearchParams({
      $filter: `sentDateTime ge ${since}`,
      $orderby: "sentDateTime desc",
      $top: "100",
      $select: "conversationId,sentDateTime",
    });
    let inbox: GraphMail[];
    let sent: GraphMail[];
    let mailbox = "";
    try {
      const [a, b, me] = await Promise.all([
        graph<{ value?: GraphMail[] }>(token, `/me/mailFolders/inbox/messages?${inboxQ.toString()}`),
        graph<{ value?: GraphMail[] }>(token, `/me/mailFolders/sentitems/messages?${sentQ.toString()}`).catch(() => ({ value: [] as GraphMail[] })),
        graph<{ mail?: string; userPrincipalName?: string }>(token, "/me?$select=mail,userPrincipalName").catch(() => ({} as { mail?: string; userPrincipalName?: string })),
      ]);
      inbox = a.value ?? [];
      sent = b.value ?? [];
      mailbox = (me.mail || me.userPrincipalName || "").toLowerCase();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Outlook didn't answer just now." };
    }

    /* Their last reply in each conversation. */
    const lastSent = new Map<string, string>();
    for (const s of sent) {
      const c = s.conversationId ?? "";
      if (c && (!lastSent.has(c) || (s.sentDateTime ?? "") > (lastSent.get(c) ?? ""))) lastSent.set(c, s.sentDateTime ?? "");
    }

    const real = inbox.filter((m) => !automated(m) && (m.from?.emailAddress?.address ?? "").toLowerCase() !== mailbox);
    const skipped = inbox.length - real.length;

    /* One search per sender, on their own book. An unlinked account matches
       nothing rather than the whole business (null would be everything). */
    const rex = ctx.scope.everything ? null : ctx.scope.rexUserId;
    const canMatch = !ctx.scope.unlinked && (ctx.scope.everything || Boolean(ctx.scope.rexUserId));
    const senders = [...new Set(real.map((m) => (m.from?.emailAddress?.address ?? "").toLowerCase()).filter((e) => e && !isInternalAddress(e)))].slice(0, 15);
    const files = new Map<string, ReturnType<typeof fileFrom>>();
    if (canMatch) {
      /* A landlord writing about their appraisal: the search bar does not
         reach appraisals, so they are matched here by the landlord's email,
         on this person's own appraisals (the rule find_property uses). */
      const appraisals = await listAppraisals().catch(() => []);
      for (const a of appraisals) {
        const e = (a.landlordEmail ?? "").toLowerCase();
        if (!e || !senders.includes(e) || files.has(e)) continue;
        if (!ctx.scope.everything && a.agent !== ctx.scope.label) continue;
        files.set(e, { label: a.address.split(",")[0], href: `/market-appraisals/${encodeURIComponent(a.id)}`, what: `their appraisal (${a.address})` });
      }
      await Promise.all(
        senders.filter((e) => !files.has(e)).map(async (e) => {
          files.set(e, fileFrom(await searchEverything(e, rex).catch(() => [])));
        })
      );
    }

    const emails = real.slice(0, 30).map((m) => {
      const fromEmail = (m.from?.emailAddress?.address ?? "").toLowerCase();
      const internal = isInternalAddress(fromEmail);
      const text = `${m.subject ?? ""} ${m.bodyPreview ?? ""}`;
      const urgentSigns = [
        ...(m.importance === "high" ? ["marked high importance"] : []),
        ...(m.flag?.flagStatus === "flagged" ? ["flagged"] : []),
        ...URGENT.filter((r) => r.test(text)).map((r) => (text.match(r)?.[0] ?? "").toLowerCase()),
      ];
      const replied = m.conversationId ? (lastSent.get(m.conversationId) ?? "") > (m.receivedDateTime ?? "") : false;
      const file = files.get(fromEmail) ?? null;
      return {
        from: m.from?.emailAddress?.name || fromEmail,
        fromEmail,
        who: internal ? "a colleague" : file ? `a customer - ${file.what}` : "someone outside the business",
        received: when(m.receivedDateTime),
        subject: str(m.subject) || "(no subject)",
        preview: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        unread: m.isRead === false,
        repliedTo: replied,
        urgentSigns: [...new Set(urgentSigns)].slice(0, 4),
        hasAttachments: Boolean(m.hasAttachments),
        osFile: file ? { label: file.label, href: file.href } : null,
      };
    });

    const customers = emails.filter((e) => e.osFile);
    return {
      mailbox,
      window: `the last ${hours} hours`,
      counts: {
        read: inbox.length,
        worthLookingAt: real.length,
        fromCustomersWithAFile: customers.length,
        noReplyYet: emails.filter((e) => !e.repliedTo && !e.who.startsWith("a colleague")).length,
        urgent: emails.filter((e) => e.urgentSigns.length).length,
        automatedLeftOut: skipped,
      },
      emails,
      ...(real.length > 30 ? { note: `Showing the newest 30 of ${real.length}.` } : {}),
      howToAnswer:
        "Lead with anything urgent, then customers with no reply yet, then the rest worth knowing. One short line each: who, what they want, and [the file](href) when osFile is set, using its href exactly. Say how many automated emails you left out. You cannot reply, send, delete, move or mark anything read. End with ONE offer of something you really can do: write a reply here for them to copy into Outlook, set a reminder or task to answer it, or open the file. Never offer to open their email or raise a repair. Never paste a whole email.",
    };
  },
};
