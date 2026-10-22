import "server-only";
import type { OsUser } from "@/lib/users";
import { createPassport, findPassportByEmail, markInvited, markScottishHome } from "@/lib/passport";
import { isScottish } from "@/lib/property-flags";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { switchOn } from "@/lib/switches";
import { isInternalAddress } from "@/lib/email-policy";

/**
 * THE PASSPORT INVITE, ONE SEND (22 Oct 2026).
 *
 * What POST /api/tenant/passport/invite did inline, moved here so the
 * listing's Automate passport (lib/auto-passport) sends the very same email
 * the same way as an agent pressing Send passports: minted once per tenant
 * per agent, from the agent's own mailbox, behind the customer email switch.
 * See the route for the two emails and the once-per-tenant rule.
 */

export type InviteOutcome =
  | { ok: true; alreadySent: true; invitedAt: string; token: string; path: string }
  | { ok: true; alreadySent: false; invitedAt: string; token: string; path: string; said: string }
  | { ok: false; status: number; error: string };

export async function sendPassportInvite(p: {
  me: OsUser;
  origin: string;
  name: string;
  email: string;
  address?: string;
  home?: string;
  whenPretty?: string;
  again?: boolean;
}): Promise<InviteOutcome> {
  const email = p.email.trim();
  const name = p.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: "The viewing has no usable email for the tenant." };
  }
  /* Our own address is a test (Admin → Testing): lib/resend lets it through
     the customer switch, so this early answer must not refuse it first. */
  if (!isInternalAddress(email) && !(await switchOn("customer_email"))) {
    return { ok: false, status: 409, error: "Email to customers is off. Admin, Switches, then try again." };
  }

  const existing = await findPassportByEmail(email, p.me.id);
  /* Sent for a Scottish home: no nationality on it from now on, even when the
     invite itself has already gone (lib/passport-scotland). */
  const scottishHome = isScottish(p.home, p.address);
  if (existing && scottishHome) await markScottishHome(existing.token).catch(() => null);
  if (existing?.invitedAt && !p.again) {
    return { ok: true, alreadySent: true, invitedAt: existing.invitedAt, token: existing.token, path: `/tenant/passport/${existing.token}` };
  }

  const token = existing?.token ?? (await createPassport({ name, email, agentId: p.me.id })).token;
  if (scottishHome) await markScottishHome(token).catch(() => null);
  const link = `${p.origin}/tenant/passport/${token}`;
  const firstName = name.split(/\s+/)[0] || "there";
  const whenPretty = (p.whenPretty ?? "").trim();
  const { subject, html } = whenPretty
    ? renderTleEmail("tenant-passport-invite", {
        firstName,
        address: (p.address ?? "").trim() || "the property",
        whenPretty,
        agentName: p.me.name || "Your agent",
        meetLine: `${p.me.name || "Your agent"} will meet you there.`,
        link,
      })
    : renderTleEmail("tenant-passport-request", {
        firstName,
        agentName: p.me.name || "your agent",
        link,
      });

  /* From their own Outlook where that is armed, so the tenant's reply comes
     back to the agent who invited them rather than to a shared inbox. */
  const sent = await sendAsAgent({ me: p.me, to: email, toName: name || undefined, subject, html });
  if (!sent.sent) return { ok: false, status: 502, error: sent.detail };
  await markInvited(token, p.me.name || p.me.email);
  return { ok: true, alreadySent: false, invitedAt: new Date().toISOString(), token, path: `/tenant/passport/${token}`, said: sent.detail };
}
