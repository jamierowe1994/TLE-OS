import "server-only";
import { hasDb, q } from "@/lib/db";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { emailShell } from "@/lib/email/shell";
import { msConnectionFor, msSendMail, MailboxNotConnected } from "@/lib/microsoft";
import { switchOn } from "@/lib/switches";
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
  to: "contractor" | "tenant" | "landlord" | "accounts";
  sent: boolean;
  address?: string;
  reason?: string;
  /** "own mailbox" when it went from the agent's Outlook, "public sender" otherwise. */
  via?: string;
}

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

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
    tenantName: first(o.tenant.replace(/\s*\+?\d[\d\s]{6,}\d/g, "").replace(/[\s·,-]+$/, "")),
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
    contractorFirm: c?.name && o.contractorName && first(c.name) !== o.contractorName ? ` of ${o.contractorName}` : "",
    contractorLink: `${ORIGIN}/contractor/${o.contractorToken ?? ""}`,
    happyLink: `${ORIGIN}/repair/${o.tenantToken ?? ""}?happy=yes`,
    notHappyLink: `${ORIGIN}/repair/${o.tenantToken ?? ""}?happy=no`,
  };
}

/**
 * From the agent's own mailbox when it is connected and Steve's send switch
 * is armed (James, 7 Sep 2026: "that should send from their personal email,
 * which will be linked up to the authenticator"), so the reply lands in
 * their inbox and threads. Otherwise the public sender, as before.
 */
async function send(id: string, to: string, vars: Record<string, string>, me: OsUser, who: SendOutcome["to"]): Promise<SendOutcome> {
  const address = to.trim();
  if (!address.includes("@")) return { to: who, sent: false, reason: `no email address for the ${who}` };
  let subject = "", html = "";
  try {
    ({ subject, html } = await renderTleEmailLive(id, vars));
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof Error ? e.message : "the email could not be written" };
  }
  try {
    const conn = await msConnectionFor(me.id).catch(() => null);
    if (conn?.connected && (await switchOn("assistant_email"))) {
      await msSendMail(me.id, { to: { email: address }, subject, body: html, rexUserId: me.rexUserId });
      return { to: who, sent: true, address, via: "own mailbox" };
    }
  } catch (e) {
    if (!(e instanceof MailboxNotConnected)) {
      /* Their mailbox refused: fall through to the public sender rather
         than lose the email, and say so on the timeline. */
    }
  }
  try {
    await sendEmail({ to: address, subject, html, audience: "customer", replyTo: me.email });
    return { to: who, sent: true, address, via: "public sender" };
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/** The accounts inbox: a contractor's invoice is on a job (Michael, 7 Sep 2026). Internal shell, internal sender. */
export async function tellAccounts(o: WorksOrder, accountsEmail: string): Promise<SendOutcome> {
  const address = accountsEmail.trim();
  if (!address.includes("@")) return { to: "accounts", sent: false, reason: "no accounts inbox set under Maintenance, Invoices, Who invoices are from" };
  const payee = o.payee === "agent" ? `${o.raisedBy} (paid the contractor themselves)` : o.contractorName || "the contractor";
  try {
    await sendEmail({
      to: address,
      subject: `Invoice in: #${o.ref} ${o.title}, ${pounds(o.invoicePence)} to ${payee}`,
      html: emailShell({
        heading: `Invoice in on job #${o.ref}`,
        intro: `${o.contractorName || "The contractor"}'s invoice is on the job and it is ready to key into PayProp. Nothing here has been paid.`,
        rows: [
          { title: o.propertyName + (o.locality ? `, ${o.locality}` : ""), detail: o.title, tone: "neutral" },
          { title: `${pounds(o.invoicePence)} to ${payee}`, detail: `Invoice ${o.invoiceRef || "no number"} · reference #${o.ref}${o.landlord ? ` · landlord ${o.landlord}` : ""}`, tone: "attention" },
        ],
        rowsLead: "To pay",
        button: "Open the job",
        link: `${ORIGIN}/maintenance?open=${encodeURIComponent(o.id)}`,
        image: "illustrations/email/certificates.gif",
        footnote: "Mark it paid on the job once it has gone through PayProp, and it drops off the accounts list.",
      }),
      text: `Invoice in on job #${o.ref}: ${o.title} at ${o.propertyName}. ${pounds(o.invoicePence)} to ${payee}. Reference #${o.ref}. Open: ${ORIGIN}/maintenance?open=${o.id}`,
    });
    return { to: "accounts", sent: true, address, via: "internal sender" };
  } catch (e) {
    return { to: "accounts", sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/** Which emails a move sets off. Returns every outcome, for the timeline. */
export async function emailsForMove(o: WorksOrder, action: Move["action"] | "raised" | "done_request", me: OsUser, detail: { how?: string } = {}): Promise<SendOutcome[]> {
  const out: SendOutcome[] = [];
  const vars = await varsFor(o, me);
  const contractor = await contractorOf(o.contractorId);

  const contractorOrder = async () => { if (contractor) out.push(await send("works-contractor-order", contractor.email, vars, me, "contractor")); };
  const contractorBooked = async () => { if (contractor && o.scheduledAt) out.push(await send("works-contractor-booked", contractor.email, vars, me, "contractor")); };
  const tenantBooked = async () => { if (o.scheduledAt) out.push(await send("works-tenant-booked", o.tenantEmail, vars, me, "tenant")); };

  switch (action) {
    case "raised":
      if (o.kind === "repair") out.push(await send("works-tenant-received", o.tenantEmail, vars, me, "tenant"));
      if (contractor && o.scheduledAt) {
        await contractorOrder();
        await tenantBooked();
      }
      break;
    case "tell_landlord":
      /* "Rang them" is a phone call, not an email. The report goes when
         they asked for it to. */
      if (detail.how === "emailed" || detail.how === "both") out.push(await send("works-landlord-report", o.landlordEmail, vars, me, "landlord"));
      break;
    case "contact_contractor":
      if (contractor) out.push(await send("works-contractor-report", contractor.email, vars, me, "contractor"));
      break;
    case "contractor_confirmed":
      /* Together, as James asked: the works order to the contractor and
         "we've found someone" to the tenant, in the same breath. */
      await contractorOrder();
      out.push(await send("works-tenant-found", o.tenantEmail, vars, me, "tenant"));
      break;
    case "assign":
      await contractorOrder();
      if (o.scheduledAt) await tenantBooked();
      break;
    case "schedule":
      await contractorBooked();
      await tenantBooked();
      out.push(await send("works-landlord-arranged", o.landlordEmail, vars, me, "landlord"));
      break;
    case "done_request":
      if (contractor) out.push(await send("works-contractor-done-request", contractor.email, vars, me, "contractor"));
      break;
    case "quote":
      if (o.status === "approval") out.push(await send("works-landlord-approval", o.landlordEmail, vars, me, "landlord"));
      break;
    case "done":
      /* The done note says what was done; the happy email asks the one
         question. Repairs get the question; a gas safety does not. */
      out.push(await send(o.kind === "repair" ? "works-tenant-happy" : "works-tenant-done", o.tenantEmail, vars, me, "tenant"));
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
  if (s.sent) return `Emailed the ${s.to} at ${s.address}${s.via === "own mailbox" ? ", from your own mailbox" : ""}.`;
  return `The ${s.to} was not emailed: ${(s.reason ?? "").replace(/\.+$/, "")}.`;
}
