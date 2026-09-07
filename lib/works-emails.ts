import "server-only";
import { hasDb, q } from "@/lib/db";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { pounds, URGENCIES, type Move, type WorksOrder } from "@/lib/works-orders";
import type { OsUser } from "@/lib/users";

/**
 * The emails a job sends as it moves: to the contractor, the tenant and the
 * landlord, each step its own document in the catalogue so Marketing can
 * edit the words (James, 7 Sep 2026).
 *
 *   contractor   works-contractor-order      put on the job
 *                works-contractor-booked     a date is set
 *                works-contractor-cancelled  cancelled with them on it
 *   tenant       works-tenant-received       a repair is reported
 *                works-tenant-booked         a date is set
 *                works-tenant-done           marked done
 *   landlord     works-landlord-approval     a quote over their authority
 *
 * Best effort, after the move is saved: a missing address, the customer
 * switch off, or Resend refusing comes back as a sentence for the timeline
 * and the move stands. Every outcome is written on the job, so "did the
 * tenant get told?" is answered on the sheet, not by guessing.
 */

export interface SendOutcome {
  to: "contractor" | "tenant" | "landlord";
  sent: boolean;
  address?: string;
  reason?: string;
}

const PROFILE_KEY = "tle-profile-v1";

async function agentPhone(userId: string): Promise<string> {
  if (!hasDb()) return "";
  const rows = await q<{ value: { phone?: string } | null }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, PROFILE_KEY]).catch(() => []);
  return (rows[0]?.value?.phone ?? "").trim();
}

async function contractorOf(id: string | null): Promise<{ name: string; email: string; phone: string } | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<{ name: string; email: string; phone: string }>(`SELECT name, email, phone FROM os_contractors WHERE id = $1`, [id]).catch(() => []);
  return rows[0] ?? null;
}

const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

async function varsFor(o: WorksOrder, me: OsUser): Promise<Record<string, string>> {
  const c = await contractorOf(o.contractorId);
  const phone = await agentPhone(me.id);
  return {
    ref: String(o.ref),
    title: o.title,
    address: [o.propertyName, o.locality].filter(Boolean).join(", "),
    category: o.category,
    urgency: o.kind === "repair" ? (URGENCIES.find((u) => u.id === o.urgency)?.label ?? "Routine") : "Planned",
    dueBy: when(o.dueAt),
    scheduledAt: when(o.scheduledAt),
    contractorName: c?.name ? first(c.name) : o.contractorName || "there",
    contractorPhone: c?.phone ?? "",
    tenantName: first(o.tenant.replace(/\s*\+?\d[\d\s]{6,}\d/g, "")),
    tenantPhone: (o.tenant.match(/\+?\d[\d\s]{6,}\d/) ?? [""])[0].trim(),
    landlordName: first(o.landlord),
    access: o.access || "none recorded",
    description: o.description || "",
    quote: pounds(o.quotePence),
    authority: pounds(o.authorityPence),
    agentName: me.name || "The Letting Experts",
    agentEmail: me.email,
    agentPhone: phone || me.email,
    completionNote: o.completionNote || "the work is complete.",
  };
}

async function send(id: string, to: string, vars: Record<string, string>, me: OsUser, who: SendOutcome["to"]): Promise<SendOutcome> {
  const address = to.trim();
  if (!address.includes("@")) return { to: who, sent: false, reason: `no email address for the ${who}` };
  try {
    const { subject, html } = await renderTleEmailLive(id, vars);
    await sendEmail({ to: address, subject, html, audience: "customer", replyTo: me.email });
    return { to: who, sent: true, address };
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/** Which emails a move sets off. Returns every outcome, for the timeline. */
export async function emailsForMove(o: WorksOrder, action: Move["action"] | "raised", me: OsUser): Promise<SendOutcome[]> {
  const out: SendOutcome[] = [];
  const vars = await varsFor(o, me);
  const contractor = await contractorOf(o.contractorId);

  const contractorOrder = async () => { if (contractor) out.push(await send("works-contractor-order", contractor.email, vars, me, "contractor")); };
  const contractorBooked = async () => { if (contractor && o.scheduledAt) out.push(await send("works-contractor-booked", contractor.email, vars, me, "contractor")); };
  const tenantBooked = async () => { if (o.scheduledAt) out.push(await send("works-tenant-booked", o.tenantEmail, vars, me, "tenant")); };

  switch (action) {
    case "raised":
      if (o.kind === "repair") out.push(await send("works-tenant-received", o.tenantEmail, vars, me, "tenant"));
      if (contractor) {
        await contractorOrder();
        if (o.scheduledAt) await tenantBooked();
      }
      break;
    case "assign":
      await contractorOrder();
      if (o.scheduledAt) await tenantBooked();
      break;
    case "schedule":
      await contractorBooked();
      await tenantBooked();
      break;
    case "quote":
      if (o.status === "approval") out.push(await send("works-landlord-approval", o.landlordEmail, vars, me, "landlord"));
      break;
    case "done":
      out.push(await send("works-tenant-done", o.tenantEmail, vars, me, "tenant"));
      break;
    case "cancel":
      if (contractor) out.push(await send("works-contractor-cancelled", contractor.email, vars, me, "contractor"));
      break;
    default:
      break;
  }
  return out;
}

/** One line per outcome, for the job's timeline. */
export function outcomeLine(s: SendOutcome): string {
  if (s.sent) return `Emailed the ${s.to} at ${s.address}.`;
  return `The ${s.to} was not emailed: ${s.reason}.`;
}
