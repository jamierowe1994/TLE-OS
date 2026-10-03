import "server-only";
import { sendEmail } from "@/lib/resend";
import { skyListShell } from "@/lib/email/shell-sky";
import { startVerification } from "@/lib/verification";

/**
 * The two emails behind tenant messages (3 Oct 2026), the twins of the
 * landlord ones in lib/appraisal-messages:
 *   - the agent is told a tenant wrote, with a button into the thread;
 *   - the tenant is told the agent replied, with a sign-in link into their
 *     Messages (customer mail, so the customer email switch decides).
 */

const clip = (s: string) => (s.length > 600 ? `${s.slice(0, 600)}…` : s);

export async function emailAgentAboutTenant(p: { to: string; tenant: string; body: string; link: string; tenantEmail: string }): Promise<void> {
  const html = skyListShell({
    heading: "New Message From a Tenant",
    intro: `${p.tenant} wrote from the tenant portal:`,
    rows: [{ title: clip(p.body) }],
    rowStyle: "bare",
    rowMarkers: false,
    button: "Open the message",
    link: p.link,
    tip: "Reply from Chats in the app and they get it by email and in their portal.",
    tipQuiet: true,
  });
  await sendEmail({ to: p.to, subject: `New message from ${p.tenant}`, html, audience: "internal", replyTo: p.tenantEmail || undefined });
}

export async function emailTenantReply(p: { to: string; tenantFirst: string; agentName: string; agentEmail: string; body: string; origin: string }): Promise<void> {
  const { token } = await startVerification(p.to, "tenant", { keepOthers: true });
  const link = `${p.origin.replace(/\/+$/, "")}/tenant/enter?token=${encodeURIComponent(token)}&next=/tenant/messages`;
  const agentFirst = (p.agentName || "Your agent").split(/\s+/)[0];
  const html = skyListShell({
    heading: `${agentFirst} Replied`,
    intro: `Hi ${p.tenantFirst}, ${agentFirst} has replied to your message:`,
    rows: [{ title: clip(p.body) }],
    rowStyle: "bare",
    rowMarkers: false,
    button: "Open your messages",
    link,
    tip: "Reply in your portal, or reply to this email and it goes straight to them.",
    tipQuiet: true,
  });
  await sendEmail({ to: p.to, subject: `${agentFirst} replied to your message`, html, audience: "customer", replyTo: p.agentEmail || undefined });
}
