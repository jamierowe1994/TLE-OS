import "server-only";
import type { OsUser } from "@/lib/users";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { createPassport, findPassportByEmail, markInvited } from "@/lib/passport";
import { sendAsAgent, type AgentSendResult } from "@/lib/send-as-agent";
import { logDone } from "@/lib/tenant-email-send";

/**
 * HOMES THAT FIT, from an agent to one tenant - the one send behind both
 * buttons that put homes in front of people (17 Sep 2026):
 *
 *   Email properties on a lead    one person, the homes the agent ticked
 *   Mail the database on a listing   one home, everybody it suits
 *
 * Hoisted out of app/api/leads/email-properties so the two cannot drift: the
 * same email, the same passport button, the same entry on the tenant email
 * log (which is what lets Anything Close? follow up four days later).
 */

export type FitHome = { id?: string | null; name: string; locality?: string | null; rent?: number | null; rentPeriod?: string | null };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function vars(p: { name: string; homes: FitHome[]; agentName: string; link: string }) {
  const homesList = p.homes
    .map((h) => {
      const per = /week/i.test(h.rentPeriod ?? "") ? "per week" : "pcm";
      const rent = typeof h.rent === "number" && h.rent > 0 ? `<strong>£${Math.round(h.rent).toLocaleString("en-GB")} ${per}</strong> · ` : "";
      return `${rent}${esc(String(h.name))}${h.locality ? `, ${esc(String(h.locality))}` : ""}`;
    })
    .join("<br>");
  return {
    firstName: p.name.trim().split(/\s+/)[0] || "there",
    count: String(p.homes.length),
    introLine:
      p.homes.length === 1
        ? "Here's a home on with us right now that I think fits what you're after."
        : "Here are the homes on with us right now that I think fit what you're after.",
    homesList,
    agentName: p.agentName,
    link: p.link,
  };
}

export async function renderHomesThatFit(p: { name: string; homes: FitHome[]; agentName: string; link: string }) {
  const { subject, html } = await renderTleEmailLive("tenant-matches", vars(p));
  /* One home reads "1 homes" in the catalogue's subject. */
  return { subject: p.homes.length === 1 ? subject.replace(/^1 homes that fit/, "A home that fits") : subject, html };
}

/** Render, mint or reuse their passport, send as the agent, log it. */
export async function sendHomesThatFit(p: { me: OsUser; name: string; to: string; homes: FitHome[]; origin: string }): Promise<AgentSendResult> {
  const to = p.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, via: null, timeline: false, reason: "no_address", detail: "There is no usable email address on their record, so nothing was sent." };
  }

  /* The button is their passport, so it has to exist. The same one if they
     already have it, never a second. */
  let token: string;
  try {
    const existing = await findPassportByEmail(to, p.me.id).catch(() => null);
    token = existing?.token ?? (await createPassport({ name: p.name, email: to, agentId: p.me.id })).token;
  } catch (e) {
    return { sent: false, via: null, timeline: false, reason: "refused", detail: `Nothing was sent: the passport link could not be made (${e instanceof Error ? e.message : "unknown"}).` };
  }

  const { subject, html } = await renderHomesThatFit({
    name: p.name,
    homes: p.homes,
    agentName: p.me.name || "The Letting Experts",
    link: `${p.origin}/tenant/passport/${token}`,
  });
  const r = await sendAsAgent({ me: p.me, to, toName: p.name, subject, html });
  if (r.sent) {
    await markInvited(token, p.me.name).catch(() => null);
    /* On the tenant email log, with the homes, so Anything Close? can follow
       up in four days with what has come on near them since. */
    await logDone(`tenant-matches:${to.toLowerCase()}:${Date.now()}`, "tenant-matches", to, "sent", r.detail, {
      name: p.name,
      agentId: p.me.id,
      homes: p.homes.map((h) => ({ id: h.id ?? null, name: h.name, locality: h.locality ?? null, rent: h.rent ?? null })),
    }).catch(() => null);
  }
  return r;
}
