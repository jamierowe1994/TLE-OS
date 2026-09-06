import "server-only";
import { emailShell, type ShellRow } from "@/lib/email/shell";
import { eventSentence, type DealEvent } from "@/lib/business/deal-events";
import { digestText, type DealAlert } from "@/lib/business/deal-alerts";

/**
 * Every email the OS sends to ITS OWN PEOPLE, on the one shell.
 *
 * Before 6 Sep 2026 an agent could get three different-looking emails from
 * the same system in one morning: the clean TLE OS doorway (invite, reset),
 * a red Letting Experts card (certificate chase), and a monospace <pre> dump
 * (the pre-tenancy digest, Landlord Radar). James: "go through all of the
 * pre-templated emails to the TLE agents to make sure they look right" - so
 * they all sit on `emailShell` now, and the only thing that changes between
 * them is the picture, the words and the list.
 *
 * Landlord and tenant emails are NOT here. They go out under The Letting
 * Experts on the public sender and keep the company's own letterhead.
 *
 * Every builder returns subject, html AND text. The text is not an
 * afterthought: Outlook on Windows shows the first frame of a GIF and some
 * clients show nothing at all, and the words have to stand on their own.
 */

const SITE = (process.env.OS_PUBLIC_URL || process.env.OS_ORIGIN || "https://tle-os.co.uk").replace(/\/+$/, "");

export interface AgentEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * A chase line as the routes already build it - "<strong>41 Harewood
 * Road</strong> - Gas safety, expires in 12 days" - split into a row. The
 * routes are not restyled here: their lines are also what the Admin dry-run
 * prints, and one source for both is the point.
 */
export function lineToRow(line: string): ShellRow {
  const plain = line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const at = plain.indexOf(" - ");
  const title = at === -1 ? plain : plain.slice(0, at);
  const detail = at === -1 ? undefined : plain.slice(at + 3);
  const hot = /expired|not on file|no certificate|overdue|missing/i.test(detail ?? plain);
  return { title, detail, tone: hot ? "attention" : "neutral" };
}

const textRows = (rows: ShellRow[]) => rows.map((r) => `  ${r.title}${r.detail ? ` - ${r.detail}` : ""}`).join("\n");

/* ── Certificates due on an agent's book (30/14/7) ───────────────────── */

export function certificateChaseEmail(input: { firstName: string; lines: string[] }): AgentEmail {
  const rows = input.lines.map(lineToRow);
  const n = rows.length;
  const subject = `${n} of your propert${n === 1 ? "y needs" : "ies need"} a certificate`;
  const intro =
    "These need a certificate renewing, worst first - anything already expired is at the top, because a let can't legally proceed without it. Chase the landlord, or book the contractor if that's the arrangement on the property. Once the certificate is on file the reminder stops by itself.";
  const link = `${SITE}/compliance`;
  return {
    subject,
    html: emailShell({
      heading: `Certificates due, ${input.firstName}`,
      intro,
      rows,
      rowsLead: `${n} propert${n === 1 ? "y" : "ies"} on your book`,
      button: "Open Compliance",
      link,
      image: "illustrations/email/certificates.gif",
      footnote:
        "If a property on this list isn't yours any more, say so - it means the record is wrong, and the landlord may be getting chased by nobody.",
    }),
    text: [`Certificates due, ${input.firstName}`, "", intro, "", textRows(rows), "", `Open Compliance: ${link}`].join("\n"),
  };
}

/* ── An agent's own compliance (item 11) ──────────────────────────────── */

export function ownComplianceEmail(input: { firstName: string; lines: string[] }): AgentEmail {
  const rows = input.lines.map(lineToRow);
  const n = rows.length;
  const subject = `${n} thing${n === 1 ? "" : "s"} you hold personally need${n === 1 ? "s" : ""} attention`;
  const intro =
    "These are the things you hold personally as a TLE partner agent, and each one is either not on file or running out. Renew or get the thing, then mark it done on your profile with the date - the reminder stops by itself once the date is in.";
  const link = `${SITE}/profile`;
  return {
    subject,
    html: emailShell({
      heading: "Your own compliance",
      intro,
      rows,
      rowsLead: "Worst first",
      button: "Open your profile",
      link,
      image: "illustrations/email/own-compliance.gif",
      footnote: "Michael checks it from his side. Only his tick reads as checked.",
    }),
    text: ["Your own compliance", "", intro, "", textRows(rows), "", `Open your profile: ${link}`].join("\n"),
  };
}

/** The daily roll-up to whoever holds the compliance role: who is short, and on what. */
export function ownComplianceRollupEmail(input: { people: { name: string; lines: string[] }[] }): AgentEmail {
  const n = input.people.length;
  const rows: ShellRow[] = input.people.map((p) => ({
    title: p.name,
    detail: p.lines.map((l) => l.replace(/<[^>]+>/g, "")).join("; "),
    tone: "attention",
  }));
  const subject = `${n} agent${n === 1 ? "" : "s"} short on their own compliance`;
  const intro = "Each of them has had their own reminder this morning. This is the list from your side.";
  const link = `${SITE}/agent-compliance`;
  return {
    subject,
    html: emailShell({
      heading: subject,
      intro,
      rows,
      button: "Open Agent compliance",
      link,
      image: "illustrations/email/own-compliance.gif",
    }),
    text: [subject, "", intro, "", textRows(rows), "", `Open Agent compliance: ${link}`].join("\n"),
  };
}

/* ── The pre-tenancy digest ───────────────────────────────────────────── */

export function pretenancyDigestEmail(alerts: DealAlert[]): AgentEmail {
  /* Grouped by property, the way digestText groups it - one stalled deal
     trips several checks and she works a property at a time. */
  const byDeal = new Map<string, DealAlert[]>();
  for (const a of alerts) {
    const cur = byDeal.get(a.dealId);
    if (cur) cur.push(a);
    else byDeal.set(a.dealId, [a]);
  }
  const groups = [...byDeal.values()];
  const attention = groups.filter((g) => g[0].tone === "attention");
  const good = groups.filter((g) => g[0].tone !== "attention");
  const row = (g: DealAlert[]): ShellRow => ({
    title: g[0].address + (g[0].agentName ? ` · ${g[0].agentName}` : ""),
    detail: g.map((a) => a.text).join(" · "),
    tone: g[0].tone === "attention" ? "attention" : "good",
  });
  const rows = [...attention.map(row), ...good.map(row)];
  const n = alerts.length;
  const subject = `Pre-tenancy: ${n} thing${n === 1 ? "" : "s"} to look at`;
  const lead =
    attention.length && good.length
      ? `${attention.length} need${attention.length === 1 ? "s" : ""} a look · ${good.length} started paying`
      : attention.length
        ? `${attention.length} propert${attention.length === 1 ? "y needs" : "ies need"} a look`
        : `${good.length} tenanc${good.length === 1 ? "y has" : "ies have"} started paying`;
  const link = `${SITE}/pre-tenancy/dashboard`;
  return {
    subject,
    html: emailShell({
      heading: "This morning's pre-tenancy",
      intro:
        "Each of these is a disagreement between what the pipeline says and what PayProp shows. Nothing here is a tick somebody made - it is money and paperwork that did or did not arrive.",
      rows,
      rowsLead: lead,
      button: "Open the board",
      link,
      image: "illustrations/email/digest.gif",
      footnote: "A property drops off the list by itself once the record and the money agree.",
    }),
    text: digestText(alerts),
  };
}

/* ── A deal moved (Propoly watcher, to the agent) ─────────────────────── */

export function dealMovedEmail(e: DealEvent, origin: string): AgentEmail {
  const sentence = eventSentence(e);
  const next =
    e.event === "references_back"
      ? "Next: start the PLC check from the application. Every certificate and ID needs to be in the pack before it goes to Kirstie, or the check fails and costs another £60."
      : e.event === "agreement_out"
        ? "Next: nothing until both the landlord and the tenant have signed. Kirstie will mark it complete."
        : e.event === "complete"
          ? "Signed and monies in. Move-in is the last step."
          : e.event === "rent_in"
            ? "The first rent has landed in PayProp. Kirstie will close the deal off; you can plan the move-in."
            : e.event === "move_in_ready"
              ? "Kirstie has signed the property off as compliant and the tenant ready to move in. Keys, inventory and check-in are yours to arrange."
              : "Propoly has cancelled this deal. If that is a surprise, speak to Kirstie.";
  const subjectWord: Partial<Record<DealEvent["event"], string>> = {
    references_back: "References back",
    agreement_out: "Out for signing",
    complete: "Complete",
    cancelled: "Cancelled",
    rent_in: "Rent in",
    move_in_ready: "Ready to move in",
  };
  const subject = `${subjectWord[e.event] ?? sentence}: ${e.property}`;
  const link = `${origin.replace(/\/+$/, "")}/applications`;
  return {
    subject,
    html: emailShell({
      heading: e.property,
      intro: `${sentence}.`,
      rows: [{ title: "What happens next", detail: next, tone: e.event === "cancelled" ? "attention" : "good" }],
      button: "Open my applications",
      link,
      image: "illustrations/email/deal-moved.gif",
    }),
    text: `${e.property}\n${sentence}.\n\n${next}\n\nOpen your applications: ${link}\n`,
  };
}

/* ── Landlord Radar, the morning note ─────────────────────────────────── */

export function radarDigestEmail(input: {
  dateLabel: string;
  active: number;
  districts: number;
  newToday: number;
  signals: { label: string; count: number }[];
  top: { score: number; address: string; rent: string | null; agent: string | null; why: string }[];
}): AgentEmail {
  const subject = `Landlord Radar: ${input.active} flagged, ${input.newToday} new`;
  const intro = `${input.active} properties flagged across ${input.districts} district${input.districts === 1 ? "" : "s"}, ${input.newToday} new today.${
    input.signals.length ? ` ${input.signals.map((s) => `${s.label} ${s.count}`).join(" · ")}.` : ""
  }`;
  const rows: ShellRow[] = input.top.map((p) => ({
    title: `${p.score} · ${p.address}${p.rent ? ` · ${p.rent}` : ""}${p.agent ? ` (${p.agent})` : ""}`,
    detail: p.why,
    tone: "neutral",
  }));
  const link = `${SITE}/tools/radar`;
  return {
    subject,
    html: emailShell({
      heading: `Landlord Radar, ${input.dateLabel}`,
      intro,
      rows,
      rowsLead: "Top ten not yet worked",
      button: "Open Radar",
      link,
      image: "illustrations/email/radar.gif",
    }),
    text: [`Landlord Radar - ${input.dateLabel}`, "", intro, "", "Top ten not yet worked:", textRows(rows), "", `Open Radar: ${link}`].join("\n"),
  };
}
