import "server-only";
import { msAccessTokenFor, MailboxNotConnected } from "@/lib/microsoft";

/**
 * THE CONVERSATION WITH ONE PERSON, OUT OF THE AGENT'S OWN MAILBOX (15 Sep 2026).
 *
 * The OS now sends in-house - confirmations reply-to the agent, contracts from
 * the agent - so the answers land in the agent's Outlook, where the record
 * cannot see them and a colleague covering the lead never will. Master list
 * J12: "Nothing inbound exists."
 *
 * Read live, never copied. Mail.Read is on the consent every agent gave
 * (lib/microsoft); this asks Graph for the messages the agent has exchanged
 * with one address - from, to or copied - and hands back what a list needs:
 * subject, who, when, which way, the preview line and a link to open it in
 * Outlook. No body is stored, and it is only ever the signed-in person's own
 * mailbox: an owner "viewing as" an agent is refused at the route, because
 * reading somebody's email is not the same as seeing their leads.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface MailLine {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  /** "in" when they wrote to us, "out" when we wrote to them. */
  direction: "in" | "out";
  at: string;
  preview: string;
  unread: boolean;
  link: string | null;
}

export type ThreadResult =
  | { ok: true; mailbox: string; messages: MailLine[] }
  | { ok: false; reason: "not_connected" | "refused"; detail: string };

export async function conversationWith(userId: string, email: string, limit = 25): Promise<ThreadResult> {
  const who = email.trim().toLowerCase();
  if (!/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(who)) return { ok: false, reason: "refused", detail: "No usable email address to look for." };

  let token: string;
  try {
    token = await msAccessTokenFor(userId);
  } catch (e) {
    return {
      ok: false,
      reason: "not_connected",
      detail: e instanceof MailboxNotConnected
        ? "Connect your Outlook on your Profile to see your emails with them here."
        : "Could not reach your Outlook just now.",
    };
  }

  /* participants: covers from, to and cc in one KQL term. $search cannot be
     combined with $orderby, so newest-first is done here. */
  const params = new URLSearchParams({
    $search: `"participants:${who}"`,
    $top: String(Math.min(Math.max(limit, 1), 50)),
    $select: "id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,webLink",
  });
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/me/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "refused", detail: "Outlook did not answer in time." };
  }
  if (!res.ok) {
    return { ok: false, reason: "refused", detail: `Outlook refused (${res.status}).` };
  }
  const j = (await res.json().catch(() => ({}))) as {
    value?: Array<{
      id: string; subject?: string; bodyPreview?: string; isRead?: boolean; webLink?: string;
      receivedDateTime?: string; sentDateTime?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
    }>;
  };
  const me = await mailboxOf(token);
  const messages: MailLine[] = (j.value ?? []).map((m) => {
    const fromEmail = (m.from?.emailAddress?.address ?? "").toLowerCase();
    const direction: "in" | "out" = fromEmail === who ? "in" : "out";
    return {
      id: m.id,
      subject: (m.subject ?? "").trim() || "(no subject)",
      fromName: m.from?.emailAddress?.name ?? fromEmail,
      fromEmail,
      direction,
      at: (direction === "in" ? m.receivedDateTime : m.sentDateTime ?? m.receivedDateTime) ?? "",
      preview: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      unread: direction === "in" && m.isRead === false,
      link: m.webLink ?? null,
    };
  });
  messages.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { ok: true, mailbox: me, messages };
}

async function mailboxOf(token: string): Promise<string> {
  const r = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  const j = r && r.ok ? ((await r.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string }) : {};
  return (j.mail || j.userPrincipalName || "").toLowerCase();
}
