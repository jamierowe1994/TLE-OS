import "server-only";
import { emailShell, type ShellRow } from "@/lib/email/shell";
import { skyListShell } from "@/lib/email/shell-sky";
import { pounds, type WorksOrder } from "@/lib/works-orders";
import type { AgentEmail } from "@/lib/email/agent-emails";

/**
 * The two emails a job sends to OUR OWN inboxes: accounts when an invoice
 * lands, and compliance when the job is finished.
 *
 * ── Why they live here and not next to the sending code ──────────────────
 *
 * They were written inline inside lib/works-emails.ts, which meant the only
 * way to see one was to make a job move and send it. Every other email in
 * the system can be read in Admin → Emails before it goes out, and these two
 * could not be - which is the one thing that screen exists to prevent.
 *
 * Pulled apart into subject, html and text with no database and no sender
 * behind them, so the catalogue can render them from a made-up job. The
 * senders in works-emails.ts call these and do nothing else with the words.
 *
 * Internal shell, internal sender, both of them: Michael and accounts are
 * staff, so neither is gated by the customer-email switch and neither
 * carries the customer branding.
 */

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
const jobLink = (id: string) => `${ORIGIN}/maintenance?open=${encodeURIComponent(id)}`;
const where = (o: WorksOrder) => o.propertyName + (o.locality ? `, ${o.locality}` : "");
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

/** A contractor's invoice is on a job, ready to key into PayProp. */
export function accountsInvoiceEmail(o: WorksOrder): AgentEmail {
  const payee = o.payee === "agent" ? `${o.raisedBy} (paid the contractor themselves)` : o.contractorName || "the contractor";
  const subject = `Invoice in: #${o.ref} ${o.title}, ${pounds(o.invoicePence)} to ${payee}`;
  return {
    subject,
    html: skyListShell({
      heading: `Invoice in on job #${o.ref}`,
      /* "Nothing here has been paid" is the whole point of the email: it is
         a thing to key in, not a receipt. */
      intro: `${o.contractorName || "The contractor"}'s invoice is on the job and it is ready to key into PayProp. Nothing here has been paid.`,
      rows: [
        { title: where(o), detail: o.title, tone: "neutral", icon: "mark-home.png" },
        {
          title: `${pounds(o.invoicePence)} to ${payee}`,
          detail: `Invoice ${o.invoiceRef || "no number"} · reference #${o.ref}${o.landlord ? ` · landlord ${o.landlord}` : ""}`,
          tone: "attention",
          icon: "mark-money.png",
        },
      ],
      rowsLead: "To pay",
      /* Same bare rows as its twin to compliance: two facts about one job,
         in an inbox that gets worked rather than read. */
      rowStyle: "bare",
      button: "Open the job",
      link: jobLink(o.id),
      hero: "hero-invoice.png",
      tip: "Mark it paid on the job once it has gone through PayProp, and it drops off the accounts list.",
      tipQuiet: true,
    }),
    text: `Invoice in on job #${o.ref}: ${o.title} at ${o.propertyName}. ${pounds(o.invoicePence)} to ${payee}. Reference #${o.ref}. Open: ${jobLink(o.id)}`,
  };
}

/**
 * Michael's ping. Compliance hears twice at most and never while a job is
 * open: once when it is finished, and again if a document lands on a job
 * that is already finished - the certificate that follows the visit, which
 * is the whole reason this exists.
 */
export function complianceJobEmail(o: WorksOrder, trigger: "done" | "document", file?: { name: string; by: string }): AgentEmail {
  const docs = o.files ?? [];
  const kindWord = o.kind === "planned" ? o.category : "Repair";
  const rows: ShellRow[] = [
    { title: where(o), detail: `${kindWord} · job #${o.ref}${o.landlord ? ` · landlord ${o.landlord}` : ""}`, tone: "neutral", icon: "mark-home.png" },
  ];

  let heading: string, intro: string, subject: string;
  if (trigger === "document") {
    subject = `Document on job #${o.ref}: ${file?.name ?? "a file"} - ${where(o)}`;
    heading = `A document has landed on job #${o.ref}`;
    intro = `${file?.by || "Somebody"} added a document to a job that is already finished. It is on the job with the rest of the paperwork.`;
    rows.push({ title: file?.name ?? "a file", detail: "Open the job to read or download it", tone: "attention", icon: "mark-doc.png" });
  } else {
    subject = `${kindWord} done at ${where(o)} - job #${o.ref}`;
    heading = `Job #${o.ref} is done`;
    intro = `${o.title}${o.contractorName ? `, done by ${o.contractorName}` : ""}${o.completedAt ? ` on ${when(o.completedAt)}` : ""}.${o.completionNote ? ` ${o.completionNote}` : ""}`;
    rows.push(
      docs.length
        ? { title: `${docs.length} document${docs.length === 1 ? "" : "s"} on the job`, detail: docs.map((d) => d.name).join(" · "), tone: "attention", icon: "mark-doc.png" }
        : { title: "No documents yet", detail: "Anything added from here on is sent over as it lands", tone: "neutral", icon: "mark-doc.png" }
    );
  }

  return {
    subject,
    html: skyListShell({
      heading,
      intro,
      rows,
      rowsLead: "The job",
      /* Bare rows: this is a record of one job, not a list to work through,
         and two lines about one thing do not need a box drawn round them. */
      rowStyle: "bare",
      button: "Open the job",
      link: jobLink(o.id),
      hero: "hero-job.png",
      tip: "Sent because the job finished. Nothing goes over while a job is still open.",
      tipQuiet: true,
    }),
    text: `${heading}. ${o.title} at ${where(o)}. Job #${o.ref}. Open: ${jobLink(o.id)}`,
  };
}

/**
 * THE AUDIT TRAIL COPY. Michael's inbox, every time a renewed certificate
 * goes out to the people entitled to it.
 *
 * ── Why an email and not just a table ────────────────────────────────────
 *
 * There is a table (os_certificate_sends) and it is the better record. But
 * "we sent the tenant the gas certificate on the 14th" is a thing somebody
 * has to prove to a third party months later, and a row in our own database
 * is a record we could have written yesterday. A dated email sitting in the
 * compliance mailbox is evidence that does not depend on us. James asked for
 * exactly this: "that needs to go out to all parties via email for audit log
 * trail purposes."
 *
 * ── It lists the failures as loudly as the sends ─────────────────────────
 *
 * A fan-out that reached the landlord and not the tenant is the case that
 * matters, and it is invisible if the email only names who it got to. So
 * every party is a row either way, and the ones that did not land say why.
 *
 * NO AMOUNT APPEARS HERE. Same rule as everywhere on this path.
 */
export function certificateSharedEmail(o: {
  label: string;
  propertyName: string;
  expiry: string;
  fileName: string;
  source: string;
  armed: boolean;
  link: string;
  outcomes: { role: string; name: string; address: string; sent: boolean; note: string }[];
}): AgentEmail {
  const went = o.outcomes.filter((x) => x.sent);
  const missed = o.outcomes.filter((x) => !x.sent);
  const who = (x: { role: string; name: string }) => x.name || x.role.charAt(0).toUpperCase() + x.role.slice(1);
  const rows: ShellRow[] = [
    {
      title: o.propertyName || "the property",
      detail: `${o.label} · runs to ${o.expiry} · ${o.fileName}${o.source ? ` · ${o.source}` : ""}`,
      tone: "neutral",
      icon: "mark-home.png",
    },
    ...o.outcomes.map((x) => ({
      title: `${who(x)} - ${x.address || "no address on the record"}`,
      detail: x.sent ? `Sent, with the certificate attached` : x.note || "not sent",
      tone: x.sent ? ("good" as const) : ("attention" as const),
      icon: "mark-doc.png",
    })),
  ];
  const heading = o.armed
    ? went.length
      ? `${o.label} sent to ${went.length} ${went.length === 1 ? "person" : "people"}`
      : `${o.label} reached nobody`
    : `${o.label} would go to ${o.outcomes.length} ${o.outcomes.length === 1 ? "person" : "people"}`;
  const intro = o.armed
    ? `The renewed ${o.label} for ${o.propertyName || "the property"} has been filed and sent out. This is the copy for the audit trail.${missed.length ? ` ${missed.length} of them did not land - the reason is against each one below.` : ""}`
    : `The renewed ${o.label} for ${o.propertyName || "the property"} has been filed. Sending it on is not armed yet, so nobody has been written to. This is who it would go to the moment it is.`;
  return {
    subject: o.armed
      ? `${o.label} sent out: ${o.propertyName || "a property"}${missed.length ? ` (${missed.length} did not land)` : ""}`
      : `Not armed: ${o.label} for ${o.propertyName || "a property"} reached nobody`,
    html: skyListShell({
      heading,
      intro,
      rows,
      rowsLead: o.armed ? "Who has it" : "Who would have it",
      /* Bare rows, like its twins: a list of facts about one document, in an
         inbox that gets worked rather than read. */
      rowStyle: "bare",
      button: "Open the property file",
      link: o.link,
      hero: "hero-job.png",
      tip: "The certificate only. No invoice and no cost is ever attached to one of these.",
      tipQuiet: true,
    }),
    text: `${heading}. ${o.label} for ${o.propertyName}, runs to ${o.expiry}. ${o.outcomes.map((x) => `${who(x)} <${x.address}>: ${x.sent ? "sent" : x.note || "not sent"}`).join("; ")}. ${o.link}`,
  };
}
