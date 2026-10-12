import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { addTenantMessage } from "@/lib/chats";

/**
 * "Send to portal" (James, 12 Oct 2026): an email the agent sent from a
 * let's page, also put in the person's portal under Messages, so it is
 * there when they sign in. Only where they have a portal account - nobody
 * is invited by this. The email has already gone; this is the copy.
 */

/** The words of a sent email, without the template around them: from its
 *  heading to the line above the footer, as plain text. */
export function portalText(html: string, subject: string, from?: { heading?: string; footLine?: string }): string {
  const text = html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&bull;/g, "•")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  let body = text;
  if (from?.heading) {
    const i = body.indexOf(from.heading);
    if (i >= 0) body = body.slice(i);
  }
  if (from?.footLine) {
    const j = body.indexOf(from.footLine);
    if (j > 0) body = body.slice(0, j);
  }
  return `${subject}\n\n${body.trim()}`.slice(0, 6000);
}

export async function logToPortal(p: { role: "tenant" | "landlord"; email: string | null; text: string; agentEmail: string }): Promise<{ logged: boolean; why?: string }> {
  if (!hasDb()) return { logged: false, why: "The portal isn't connected here." };
  const email = (p.email ?? "").trim().toLowerCase();
  if (!email) return { logged: false, why: "They have no email on file, so no portal account to put it in." };
  const rows = await q<{ id: string }>(`SELECT id FROM os_portal_accounts WHERE lower(email) = $1 AND kind = $2 LIMIT 1`, [email, p.role]).catch(() => []);
  const account = rows[0]?.id;
  if (!account) return { logged: false, why: `They don't have a ${p.role} portal account yet, so it's in their email only.` };
  if (p.role === "tenant") {
    await addTenantMessage({ accountId: account, direction: "agent", body: p.text, agentEmail: p.agentEmail });
  } else {
    await q(
      `INSERT INTO os_landlord_messages (id, account_id, appraisal_id, direction, body, to_email, read_at)
       VALUES ($1,$2,NULL,'agent',$3,$4,NOW())`,
      [uid(), account, p.text, p.agentEmail]
    );
  }
  return { logged: true };
}
