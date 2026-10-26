import "server-only";
import { agentPhone, OFFICE_PHONE } from "@/lib/agent-phone";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { accountsInvoiceEmail, complianceJobEmail, landlordInvoiceAnswerEmail } from "@/lib/email/works-internal";
import { bankForInvoice } from "@/lib/contractor-bank";
import { recentBankChanges } from "@/lib/bank-vault";
import type { BankDetails } from "@/lib/bank";
import { msConnectionFor, msSendMail, MailboxNotConnected } from "@/lib/microsoft";
import { switchOn } from "@/lib/switches";
import { isInternalAddress } from "@/lib/email-policy";
import { contractorBank, markOrderSent, pounds, tenantsOf, URGENCIES, type Move, type MoveOut, type QuoteAsk, type WorksOrder } from "@/lib/works-orders";
import type { OsUser } from "@/lib/users";
import { getLandlordPref, landlordHold } from "@/lib/landlord-prefs";
import { propertyAgentFor } from "@/lib/works-property-agent";
import { invoiceSettings } from "@/lib/invoices";
import { withR2, R2_BUCKET, r2Configured } from "@/lib/r2";
import { homePeople } from "@/lib/home-people";
import { keyNumbersFor, rexIdOf } from "@/lib/home-keys";
import { accessLineFor } from "@/lib/viewing-brief";
import type { JobTenant } from "@/lib/works-orders";
import { CHASE_GRACE_HOURS } from "@/lib/works-chase-rules";

/**
 * The emails a job sends as it moves: to the contractor, the tenant and the
 * landlord, each step its own document in the catalogue so Marketing can
 * edit the words (James, 7 Sep 2026).
 *
 *   contractor   works-contractor-order      put on the job
 *                works-contractor-booked     a date is set
 *                works-contractor-cancelled  cancelled with them on it
 *                works-contractor-quote-request  asked for a price, on their own link
 *                works-contractor-quote-closed   another firm's quote was taken
 *   tenant       works-tenant-received       a repair is reported
 *                works-tenant-booked         a date is set
 *                works-tenant-done           marked done
 *   landlord     works-landlord-approval     a quote over their authority
 *                works-landlord-arranged     a date is set
 *
 * The landlord's two that go on their own - arranged and approval - first
 * ask the landlord's own choice (lib/landlord-prefs, 6 Oct 2026): every job,
 * only over a figure, or none. Held, the timeline says why, and a held
 * approval says ring them. The report is the agent's own press of a button,
 * so it goes as asked.
 *
 * Best effort, after the move is saved: a missing address, the customer
 * switch off, or Resend refusing comes back as a sentence for the timeline
 * and the move stands. Every outcome is written on the job, so "did the
 * tenant get told?" is answered on the sheet, not by guessing.
 */

export interface SendOutcome {
  to: "contractor" | "tenant" | "landlord" | "accounts" | "compliance";
  sent: boolean;
  address?: string;
  reason?: string;
  /** "own mailbox" when it went from the agent's Outlook, "public sender" otherwise. */
  via?: string;
  /** Who was copied in: the home's agent on a contractor email. */
  cc?: string;
  /** The firm, when several contractors are written to on one move. */
  name?: string;
}

/**
 * A rehearsal's post.
 *
 * A walkthrough job renders every email for real and then keeps it here
 * instead of sending it, so the landlord's and the tenant's tabs show the
 * actual thing that would land in their inbox - the catalogue's words, the
 * live edits, this job's details - with no chance of it reaching a real
 * person. James, 7 Sep 2026: "check both the landlord and the tenant areas
 * to see what they would see."
 */
async function keep(orderId: string, role: SendOutcome["to"], address: string, subject: string, html: string): Promise<SendOutcome> {
  await q(
    `INSERT INTO os_rehearsal_emails (id, order_id, role, address, subject, html) VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomBytes(12).toString("hex"), orderId, role, address, subject, html]
  ).catch(() => {});
  return { to: role, sent: true, address, via: "the rehearsal" };
}

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

async function contractorOf(id: string | null): Promise<{ name: string; contact: string; email: string; phone: string } | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<{ name: string; contact: string; email: string; phone: string }>(`SELECT name, contact, email, phone FROM os_contractors WHERE id = $1`, [id]).catch(() => []);
  return rows[0] ?? null;
}

const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
/* Coerced: a preview can carry a tenant with no phone or email, and
   undefined.replace crashed the whole preview (Rig run 4, P-064). */
const esc = (v: string | null | undefined) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "") : "not recorded";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

/**
 * WHAT THE HOME ITSELF SAYS ABOUT GETTING IN (Sean McMahon, 22 Oct 2026: a
 * quote request went with no tenant or access, and the contractor asked why
 * they had been sent it). The job's own tenants and access notes come first;
 * where the job holds none (taken on from the old system, or raised before
 * the tenants were on it) the home's sitting tenants and access notes are
 * read, and the key numbers we hold and a lockbox are always added. Never
 * throws: an email with less in it beats no email.
 */
async function homeAccessFor(o: WorksOrder): Promise<{ tenants: JobTenant[]; access: string }> {
  if (!o.propertyId) return { tenants: [], access: "" };
  const needPeople = !tenantsOf(o).length || !o.access;
  const [people, rexId, keys] = await Promise.all([
    needPeople ? homePeople(o.propertyId).catch(() => null) : Promise.resolve(null),
    rexIdOf(o.propertyId).catch(() => null),
    keyNumbersFor(o.propertyId).catch(() => ""),
  ]);
  /* The viewing access record says vacant-with-our-keys or a lockbox code;
     the tenant/landlord kinds are about viewings and are left out. */
  const viewing = await accessLineFor(null, rexId ?? o.propertyId).catch(() => null);
  const self = viewing && /^(Vacant|Lockbox)/.test(viewing) ? viewing : "";
  return {
    tenants: (people?.tenants ?? []).map((t) => ({ name: t.name, phone: t.phone ?? "", email: t.email ?? "", ...(t.room ? { room: t.room } : {}) })),
    access: [o.access ? "" : people?.access ?? "", self, keys ? `We hold keys in the office (${keys}).` : ""].map((x) => x.trim()).filter(Boolean).join(" "),
  };
}

async function varsFor(o: WorksOrder, me: OsUser): Promise<Record<string, string>> {
  const c = await contractorOf(o.contractorId);
  const phone = await agentPhone(me.id);
  const home = await homeAccessFor(o).catch(() => ({ tenants: [] as JobTenant[], access: "" }));
  const tenants = tenantsOf(o).length ? tenantsOf(o) : home.tenants;
  return {
    ref: String(o.ref),
    title: o.title,
    address: [o.propertyName, o.locality].filter(Boolean).join(", "),
    category: o.category,
    urgency: o.kind === "repair" ? (URGENCIES.find((u) => u.id === o.urgency)?.label ?? "Routine") : "Planned",
    dueBy: when(o.dueAt),
    scheduledAt: when(o.scheduledAt),
    /* The firm when we talk ABOUT them ("Redland Plumbing & Heating is
       booked"), the person when we talk TO them ("Hi Dev"). One var for each
       reading, because sharing one made a landlord's email say "Redland is
       booked to attend", which reads like a first name. */
    contractorName: c?.name || o.contractorName || "the contractor",
    contractorGreeting: c?.contact ? first(c.contact) : c?.name || o.contractorName || "there",
    contractorPhone: c?.phone ?? "",
    /* The name and the number are their own fields now. The old rows kept
       both in `tenant`, so those still get picked apart. */
    tenantName: first((o.tenant || tenants[0]?.name || "").replace(/\s*\+?\d[\d\s]{6,}\d/g, "").replace(/[\s·,-]+$/, "")),
    tenantPhone: o.tenantPhone || (o.tenant.match(/\+?\d[\d\s]{6,}\d/) ?? [""])[0].trim() || tenants[0]?.phone || "",
    landlordName: first(o.landlord),
    access: [o.access, home.access].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || "none recorded - ring us and we'll arrange it",
    description: o.description || "",
    quote: pounds(o.quotePence),
    authority: pounds(o.authorityPence),
    agentName: me.name || "The Letting Experts",
    agentEmail: me.email,
    /* The office line when the sender has no phone on their profile (10 Oct
       2026: 9 of 14 staff had none, so tenants read "ring us on
       rhiannon.dodge@..."). The same number the handover and pre-send use. */
    agentPhone: phone || OFFICE_PHONE,
    completionNote: o.completionNote || "the work is complete.",
    contractorLink: `${ORIGIN}/contractor/${o.contractorToken ?? ""}`,
    /* The planned works order's own four (works-contractor-planned). */
    dueDay: day(o.dueAt),
    tenantsList: tenants.map((t) => [`${esc(t.name || "Tenant")}${t.room ? ` (${esc(t.room)})` : ""}`, esc(t.phone), esc(t.email)].filter(Boolean).join(" · ")).join("<br>") || "None on file - ring us and we'll arrange access.",
    bookingLine: o.scheduledAt
      ? `It's already booked for <strong>${esc(when(o.scheduledAt))}</strong>. If that changes, tell us on the same page.`
      : "Once you've agreed a time with the tenants, press the button and tell us the date and time.",
    buttonLabel: o.scheduledAt ? "Open the job" : "Let us know the date and time",
    /* The landlord's invoice page (Kirstie Mulholland, 20 Oct 2026), each
       button opening it with that answer picked. */
    invoice: pounds(o.invoicePence),
    invoicePayLink: `${ORIGIN}/invoice/ok/${o.landlordInvoiceToken ?? ""}?answer=pay`,
    invoiceDirectLink: `${ORIGIN}/invoice/ok/${o.landlordInvoiceToken ?? ""}?answer=direct`,
    invoiceQueryLink: `${ORIGIN}/invoice/ok/${o.landlordInvoiceToken ?? ""}?answer=query`,
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
async function send(o: WorksOrder, id: string, to: string, vars: Record<string, string>, me: OsUser, who: SendOutcome["to"]): Promise<SendOutcome> {
  const address = to.trim();
  if (!address.includes("@")) return { to: who, sent: false, reason: `no email address for the ${who}` };
  let subject = "", html = "";
  try {
    ({ subject, html } = await renderTleEmailLive(id, vars));
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof Error ? e.message : "the email could not be written" };
  }
  if (o.rehearsal) return keep(o.id, who, address, subject, html);
  /* The home's agent is copied into everything the contractor is sent
     (James, 9 Oct 2026), so they see the job go out even when the office
     sends it. Not when they ARE the sender from their own mailbox: it is
     already in their Sent Items, and a copy to yourself is noise. */
  const agent = who === "contractor" ? await propertyAgentFor(o).catch(() => null) : null;
  const ccFor = (fromOwnMailbox: boolean) =>
    agent && agent.email.toLowerCase() !== address.toLowerCase() && !(fromOwnMailbox && agent.email.toLowerCase() === me.email.trim().toLowerCase()) ? agent : null;
  try {
    const conn = await msConnectionFor(me.id).catch(() => null);
    /* The customer switch as well (18 Sep 2026). This road checked only the
       Outlook switch, so with "Email to landlords and tenants" OFF a landlord
       or tenant could still be written to from the agent's own mailbox - and
       the works sweep comes down this road on a timer. Our own people pass. */
    const mayWrite = isInternalAddress(address) || (await switchOn("customer_email"));
    if (mayWrite && conn?.connected && (await switchOn("assistant_email"))) {
      const cc = ccFor(true);
      await msSendMail(me.id, { to: { email: address }, ...(cc ? { cc: [{ email: cc.email, name: cc.name }] } : {}), subject, body: html, rexUserId: me.rexUserId });
      return { to: who, sent: true, address, via: "own mailbox", ...(cc ? { cc: cc.name } : {}) };
    }
  } catch (e) {
    if (!(e instanceof MailboxNotConnected)) {
      /* Their mailbox refused: fall through to the public sender rather
         than lose the email, and say so on the timeline. */
    }
  }
  try {
    const cc = ccFor(false);
    await sendEmail({ to: address, subject, html, audience: "customer", replyTo: me.email, ...(cc ? { cc: [cc.email] } : {}) });
    return { to: who, sent: true, address, via: "public sender", ...(cc ? { cc: cc.name } : {}) };
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/** The newest invoice file on the job, read out of storage for an email. Never throws. */
async function invoiceAttachments(o: WorksOrder): Promise<{ filename: string; content: string }[]> {
  const file = [...(o.files ?? [])].reverse().find((f) => f.kind === "invoice");
  if (!file || !r2Configured) return [];
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const bytes = await withR2(async (client) => {
      const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    });
    /* Resend's limit is 40MB for the whole email; stay well under it. */
    if (!bytes || bytes.length > 20 * 1024 * 1024) return [];
    return [{ filename: file.name || `invoice-job-${o.ref}.pdf`, content: Buffer.from(bytes).toString("base64") }];
  } catch {
    return [];
  }
}

/**
 * Whether accounts should ring the contractor before paying (lib/bank-vault,
 * 26 Oct 2026): the details came with this invoice and aren't the ones on
 * the contractor's record, or the record's details were replaced in the last
 * 30 days. Null when neither.
 */
async function bankCaution(o: WorksOrder, bank: BankDetails & { from: "invoice" | "record" }): Promise<string | null> {
  const who = o.contractorName || "the contractor";
  const ring = `Before paying, ring ${who} on a number you already had (not one from the invoice or an email) to confirm them.`;
  if (bank.from === "invoice" && o.contractorId) {
    const held = await contractorBank(o.contractorId).catch(() => null);
    const differs = !held || held.sortCode !== bank.sortCode || held.accountNumber !== bank.accountNumber;
    if (differs) return `${held ? `These aren't the bank details on ${who}'s record` : `${who} had no bank details on record before this invoice`}. ${ring}`;
  }
  if (o.contractorId) {
    const [changed] = await recentBankChanges(30, o.contractorId);
    if (changed) {
      const day = new Date(changed.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
      return `${who}'s bank details were changed on ${day} by ${changed.by}. ${ring}`;
    }
  }
  return null;
}

/** The accounts inbox: a contractor's invoice is on a job (Michael, 7 Sep 2026).
 *  The words live in lib/email/works-internal.ts so the catalogue can show
 *  them without a job having to move. */
export async function tellAccounts(o: WorksOrder, accountsEmail: string): Promise<SendOutcome> {
  /* No accounts inbox was ever set, so every "invoice in" went nowhere.
     James, 19 Oct 2026: the invoice goes over "for Michael to then issue"
     through PayProp - so with no accounts inbox it goes to his compliance
     inbox. An accounts inbox, once set, still wins. */
  const address = accountsEmail.trim() || (await invoiceSettings()).complianceEmail.trim();
  if (!address.includes("@")) return { to: "accounts", sent: false, reason: "no accounts or compliance inbox set under Maintenance, Invoices, Who invoices are from" };
  /* Where to pay it (Stuart Roper, 26 Oct 2026): the invoice's own details, else the contractor's record. */
  const bank = await bankForInvoice(o).catch(() => null);
  const mail = accountsInvoiceEmail(o, bank, bank ? await bankCaution(o, bank).catch(() => null) : null);
  if (o.rehearsal) return keep(o.id, "accounts", address, mail.subject, mail.html);
  try {
    /* The invoice itself goes with it, so it can be keyed into PayProp
       straight from the email. If it cannot be read, the email still goes
       with the figures and the link to the job. */
    const attachments = await invoiceAttachments(o);
    await sendEmail({ to: address, subject: mail.subject, html: mail.html, text: mail.text, ...(attachments.length ? { attachments } : {}) });
    return { to: "accounts", sent: true, address, via: "internal sender" };
  } catch (e) {
    return { to: "accounts", sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/**
 * The landlord's answer on an invoice, to accounts with the home's agent
 * copied in (Kirstie Mulholland, 20 Oct 2026). Same inbox as the invoice
 * itself went to.
 */
export async function tellInvoiceAnswer(o: WorksOrder): Promise<SendOutcome> {
  const address = ((await invoiceSettings()).accountsEmail ?? "").trim() || (await invoiceSettings()).complianceEmail.trim();
  if (!address.includes("@")) return { to: "accounts", sent: false, reason: "no accounts or compliance inbox set under Maintenance, Invoices, Who invoices are from" };
  const mail = landlordInvoiceAnswerEmail(o);
  if (o.rehearsal) return keep(o.id, "accounts", address, mail.subject, mail.html);
  const agent = await propertyAgentFor(o).catch(() => null);
  const cc = agent && agent.email.includes("@") && agent.email.toLowerCase() !== address.toLowerCase() ? agent : null;
  try {
    await sendEmail({ to: address, subject: mail.subject, html: mail.html, text: mail.text, ...(cc ? { cc: [cc.email] } : {}) });
    return { to: "accounts", sent: true, address, via: "internal sender", ...(cc ? { cc: cc.name } : {}) };
  } catch (e) {
    return { to: "accounts", sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/**
 * Michael's ping.
 *
 * James, 7 Sep 2026: "I need an automated email to go out to Michael. He has
 * access to the compliance email... Don't bother notifying him until it's
 * complete, but when it gets completed, we should then just ping that over."
 *
 * So compliance hears twice at most, and never while a job is open:
 *
 *   done      the job is finished, with every document on it listed
 *   document  a document lands on a job that is ALREADY finished - the
 *             certificate that follows the visit, which is the whole point
 *
 * A photo taken mid-visit is silent, because the job is not done yet and it
 * will be named in the completion email anyway. That falls out of the rule
 * rather than needing a list of file types to ignore.
 *
 * Internal shell, internal sender: Michael is staff, so this is not gated by
 * the customer-email switch and does not carry the customer branding.
 */
export async function tellCompliance(
  o: WorksOrder,
  trigger: "done" | "document",
  complianceEmail: string,
  file?: { name: string; by: string }
): Promise<SendOutcome> {
  const address = complianceEmail.trim();
  if (!address.includes("@")) return { to: "compliance", sent: false, reason: "no compliance inbox set under Maintenance, Invoices" };
  const mail = complianceJobEmail(o, trigger, file);
  if (o.rehearsal) return keep(o.id, "compliance", address, mail.subject, mail.html);
  try {
    await sendEmail({ to: address, subject: mail.subject, html: mail.html, text: mail.text });
    return { to: "compliance", sent: true, address, via: "internal sender" };
  } catch (e) {
    return { to: "compliance", sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/**
 * Whether a move earns Michael an email, decided once rather than at each of
 * the routes that can complete a job or add a file.
 *
 * Returns null when it does not, so a caller can pass every move through it.
 */
export function complianceTrigger(o: WorksOrder, action: Move["action"] | "raised" | "done_request"): "done" | "document" | null {
  if (action === "done" && o.completedAt && !o.complianceToldAt) return "done";
  /* A file only counts once the job is finished; before that it rides along
     in the completion email. */
  if (action === "file" && o.completedAt) return "document";
  return null;
}

/**
 * One contractor's own quote request, or the polite no (Sean, 21 Oct 2026).
 * Each goes to that firm on its own link, so their answer is theirs and the
 * job's works-order link is never in it.
 */
async function toAsked(o: WorksOrder, a: QuoteAsk, id: string, base: Record<string, string>, me: OsUser): Promise<SendOutcome> {
  const c = await contractorOf(a.contractorId);
  const vars = {
    ...base,
    contractorName: c?.name || a.contractorName,
    contractorGreeting: c?.contact ? first(c.contact) : c?.name || a.contractorName,
    contractorPhone: c?.phone ?? "",
    contractorLink: `${ORIGIN}/contractor/${a.token}`,
  };
  return { ...(await send(o, id, c?.email ?? "", vars, me, "contractor")), name: c?.name || a.contractorName };
}

/**
 * The words that change with where a chased job is (Sean McMahon, 26 Oct
 * 2026): no date yet, or a date that has been with nothing back. The
 * deadline on the final is 48 hours from the moment it goes.
 */
function chaseVars(o: WorksOrder, remindedAt: string | null | undefined): Record<string, string> {
  const short = (v: string) => new Date(v).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
  const been = !!o.scheduledAt && new Date(o.scheduledAt).getTime() <= Date.now();
  const sent = o.contractorConfirmedAt || o.contractorContactedAt || o.createdAt;
  return {
    sentOn: short(sent),
    followedUp: remindedAt ? ` and followed up on ${short(remindedAt)}` : "",
    chaseLine: been
      ? `It was booked for ${esc(when(o.scheduledAt))}, and we haven't heard whether it's done. If it is, could you mark it done on your page and add the ${o.kind === "planned" ? "certificate" : "invoice"}?`
      : "We haven't heard back yet. Could you let us know the date you're going?",
    chaseButton: been ? "Mark it done, or give a new date" : "Give us a date",
    cancelBy: when(new Date(Date.now() + CHASE_GRACE_HOURS * 3600000).toISOString()),
  };
}

/** Which emails a move sets off. Returns every outcome, for the timeline. */
export async function emailsForMove(o: WorksOrder, action: Move["action"] | "raised" | "done_request" | "chase_reminder" | "chase_final", me: OsUser, detail: { how?: string; quiet?: boolean; remindedAt?: string | null } & MoveOut = {}): Promise<SendOutcome[]> {
  const out: SendOutcome[] = [];
  const vars = await varsFor(o, me);
  const contractor = await contractorOf(o.contractorId);

  /* Planned maintenance (James, 8 Oct 2026): the contractor arranges a gas
     safety with the tenants directly, so the tenants hear nothing on their
     own - the agent sends the booking when they choose (tell_tenants_booked) -
     and a skipped landlord hears nothing at all. */
  const planned = o.kind === "planned";
  const contractorOrder = async () => {
    if (!contractor) return;
    const sent = await send(o, planned ? "works-contractor-planned" : "works-contractor-order", contractor.email, vars, me, "contractor");
    if (sent.sent && o.contractorId) await markOrderSent(o.id, o.contractorId, contractor.name);
    out.push(sent);
  };
  const contractorBooked = async () => { if (contractor && o.scheduledAt) out.push(await send(o, "works-contractor-booked", contractor.email, vars, me, "contractor")); };
  /* A discreet repair (Let the tenants know unticked, Lianna 9 Oct 2026):
     nothing automatic goes to any tenant on it. */
  const quiet = !planned && o.quietTenants;
  const tenantBooked = async () => { if (o.scheduledAt && !planned && !quiet) out.push(await send(o, "works-tenant-booked", o.tenantEmail, vars, me, "tenant")); };
  /* Every tenant on a repair hears that a contractor will ring them - never
     the works order, which can carry notes for the contractor only. */
  const tenantNotice = async () => {
    if (planned || quiet || !contractor) return;
    for (const t of tenantsOf(o).filter((x) => x.email.includes("@"))) {
      out.push(await send(o, "works-tenant-notice", t.email, { ...vars, tenantName: first(t.name) }, me, "tenant"));
    }
  };
  /* A planned job with the tick on (James, 10 Oct 2026): every tenant with an
     email hears who will be in touch to arrange access. Only before there is
     a date - once booked, the booking itself is the agent's button. */
  const accessNotice = async () => {
    if (!planned || !o.accessNotice || !contractor || o.scheduledAt) return;
    for (const t of tenantsOf(o).filter((x) => x.email.includes("@"))) {
      out.push(await send(o, "works-tenant-planned-notice", t.email, { ...vars, tenantName: first(t.name) }, me, "tenant"));
    }
  };
  /* The landlord's choice, read once and only when a landlord email is due.
     A failed read is the old behaviour - every job - rather than a lost
     approval request. */
  const landlord = async (id: string, kind: "notice" | "approval") => {
    if (o.landlordSkipped) return;
    const held = o.landlordEmail.includes("@") ? landlordHold(o, await getLandlordPref(o.landlordEmail).catch(() => ({ jobEmails: "all" as const, overAmount: 0, updatedBy: "", updatedAt: null })), kind) : null;
    out.push(held ? { to: "landlord", sent: false, address: o.landlordEmail, reason: held } : await send(o, id, o.landlordEmail, vars, me, "landlord"));
  };

  switch (action) {
    case "raised":
      /* The works order goes when the agent pressed Send, which is what
         stamped contractorContactedAt - a repair too, since 9 Oct 2026. */
      if (planned) {
        if (contractor && o.contractorContactedAt) {
          await contractorOrder();
          await accessNotice();
        }
      } else if (contractor && (o.contractorContactedAt || o.scheduledAt)) {
        await contractorOrder();
        if (o.scheduledAt) await tenantBooked();
        else await tenantNotice();
      } else if (!quiet) {
        /* No contractor yet: the one who reported it hears it's logged. */
        out.push(await send(o, "works-tenant-received", o.tenantEmail, vars, me, "tenant"));
      }
      break;
    case "tell_landlord":
      /* "Rang them" is a phone call, not an email. The report goes when
         they asked for it to. */
      if (detail.how === "emailed" || detail.how === "both") out.push(await send(o, "works-landlord-report", o.landlordEmail, vars, me, "landlord"));
      break;
    case "contact_contractor":
      if (contractor) out.push(await send(o, "works-contractor-report", contractor.email, vars, me, "contractor"));
      break;
    case "contractor_confirmed":
      /* Together, as James asked: the works order to the contractor and
         "we've found someone" to the tenant, in the same breath. */
      await contractorOrder();
      await tenantNotice();
      await accessNotice();
      break;
    case "tell_tenants_booked":
      /* Every tenant on the job with an address, each greeted by name. */
      for (const t of tenantsOf(o).filter((x) => x.email.includes("@"))) {
        out.push(await send(o, "works-tenant-booked", t.email, { ...vars, tenantName: first(t.name) }, me, "tenant"));
      }
      break;
    case "assign":
      /* The job page's Change the Contractor sends nothing, as it says. */
      if (detail.quiet) break;
      /* Out for quotes, a change of contractor is not a works order: the
         price comes first (Sean, 20 Oct 2026). Ask them from Ask for quotes. */
      if (o.quoteRequestedAt && o.quotePence == null) break;
      await contractorOrder();
      await accessNotice();
      if (o.scheduledAt) await tenantBooked();
      else await tenantNotice();
      break;
    case "schedule":
      await contractorBooked();
      await tenantBooked();
      await landlord("works-landlord-arranged", "notice");
      break;
    case "ask_landlord_invoice":
      /* The agent's own press of a button, so it goes as asked, like the report. */
      out.push(await send(o, "works-landlord-invoice", o.landlordEmail, vars, me, "landlord"));
      break;
    case "request_quote":
    case "resend_quote":
      for (const a of detail.asks ?? []) out.push(await toAsked(o, a, "works-contractor-quote-request", vars, me));
      break;
    case "ask_quote_in":
    case "accept_quote":
      /* A quote that became the job's: over the authority, the landlord is
         asked, exactly as a quote keyed in always did. Then the others hear
         it has gone elsewhere, so nobody prices a job that's taken. */
      if (detail.quoted && o.status === "approval") await landlord("works-landlord-approval", "approval");
      for (const a of detail.closed ?? []) out.push(await toAsked(o, a, "works-contractor-quote-closed", vars, me));
      break;
    case "resend_order":
      await contractorOrder();
      if (!planned && o.scheduledAt) await contractorBooked();
      break;
    case "done_request":
      if (contractor) out.push(await send(o, "works-contractor-done-request", contractor.email, vars, me, "contractor"));
      break;
    case "quote":
      if (o.status === "approval") await landlord("works-landlord-approval", "approval");
      break;
    case "done":
      /* The done note says what was done; the happy email asks the one
         question. Repairs get the question; a gas safety does not. */
      if (!planned && !quiet) out.push(await send(o, "works-tenant-happy", o.tenantEmail, vars, me, "tenant"));
      break;
    case "cancel":
      if (contractor) out.push(await send(o, "works-contractor-cancelled", contractor.email, vars, me, "contractor"));
      break;
    /* Chasing the contractor (lib/works-chase): by hand, or on the dates set. */
    case "chase_reminder":
    case "chase_final":
      out.push(contractor
        ? await send(o, action === "chase_final" ? "works-contractor-chase-final" : "works-contractor-chase", contractor.email, { ...vars, ...chaseVars(o, detail.remindedAt) }, me, "contractor")
        : { to: "contractor", sent: false, reason: "the contractor's record could not be found" });
      break;
    default:
      break;
  }
  return out;
}

/**
 * An email exactly as it would go, without sending it: the Send screen on
 * Plan a job shows the contractor what they are about to get (James, 8 Oct
 * 2026: "it should show a preview of what's going to get sent").
 */
export async function previewJobEmail(o: WorksOrder, id: string, me: OsUser, over: Record<string, string> = {}): Promise<{ subject: string; html: string; to: string; contractorName: string }> {
  const vars = { ...(await varsFor(o, me)), ...over };
  const c = await contractorOf(o.contractorId);
  const { subject, html } = await renderTleEmailLive(id, vars);
  return { subject, html, to: c?.email ?? "", contractorName: c?.name ?? o.contractorName };
}

/** A chase email exactly as it would go to the contractor on this job, sent nowhere (lib/works-chase). */
export async function previewChaseEmail(o: WorksOrder, kind: "reminder" | "final", me: OsUser, remindedAt: string | null): Promise<{ subject: string; html: string; to: string; contractorName: string }> {
  return previewJobEmail(o, kind === "final" ? "works-contractor-chase-final" : "works-contractor-chase", me, chaseVars(o, remindedAt));
}

/** One line per outcome, for the job's timeline. */
export function outcomeLine(s: SendOutcome): string {
  /* "Accounts" is an office, not a person: "the accounts was not emailed"
     is the sort of line that ends up on a screen in front of a client. */
  const office = s.to === "accounts" || s.to === "compliance";
  const who = s.to === "accounts" ? "Accounts" : s.to === "compliance" ? "Compliance" : s.name || `the ${s.to}`;
  const Who = s.to === "accounts" ? "Accounts'" : s.to === "compliance" ? "Compliance'" : `The ${s.to}'s`;
  if (s.via === "the rehearsal") return `Emailed ${who} at ${s.address} - written and kept here, not sent.`;
  if (s.sent) return `Emailed ${who} at ${s.address}${s.via === "own mailbox" ? ", from your own mailbox" : ""}${s.cc ? `, copying ${s.cc} in` : ""}.`;
  return `${office ? `${who} were` : s.name ? `${s.name} was` : `The ${s.to} was`} not emailed: ${(s.reason ?? "").replace(/\.+$/, "")}.`;
}
