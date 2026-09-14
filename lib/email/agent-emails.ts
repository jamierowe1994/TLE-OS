import "server-only";
import { emailShell, type ShellRow } from "@/lib/email/shell";
import { skyListShell } from "@/lib/email/shell-sky";
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
/** "2026-08-30" reads as a database. "30 Aug 2026" reads as a date. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDates = (s: string) =>
  s.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y: string, m: string, d: string) => `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`);

export function lineToRow(line: string): ShellRow {
  const plain = line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const at = plain.indexOf(" - ");
  const title = at === -1 ? plain : plain.slice(0, at);
  let detail = at === -1 ? undefined : plain.slice(at + 3);
  const hot = /expired|not on file|no certificate|overdue|missing/i.test(detail ?? plain);

  /* The badge. A number when there is one to give, and the plain fact when
     there is not - "Action needed" rather than a blank, because a row with
     nothing on the right of it reads as the row that is fine. Fourteen days
     is where it turns clay: that is the middle chase band, and the point at
     which booking a contractor stops being comfortable. */
  /* Two shapes of line reach this, because two different routes write them:
     "expires in 12 days" from the certificate chase, and "runs out
     2026-09-28 (22 days)" from an agent's own compliance. Both give a
     number; neither is worth rewriting at the source, since those strings
     are also what the Admin dry-run prints. */
  const days = /(?:\bin |\()(\d+) days?\)?/i.exec(detail ?? "");
  const pill = hot ? "Action needed" : days ? `${days[1]} day${days[1] === "1" ? "" : "s"}` : undefined;
  const urgent = hot || (days ? Number(days[1]) <= 14 : false);

  if (detail) {
    /* The count in brackets has become the badge, so it goes: "runs out
       28 Sep 2026 (22 days)" beside a badge reading "22 days" says it twice. */
    detail = prettyDates(detail).replace(/\s*\(\d+ days?\)/i, "").trim();
    detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  }

  return { title, detail, tone: hot ? "attention" : "neutral", pill, pillTone: urgent ? "urgent" : "calm" };
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
    /* The first of the list emails onto the sky look, 13 Sep 2026. The other
       three on emailShell come across one at a time, each looked at on its
       own, which is why both shells are still here. */
    html: skyListShell({
      heading: `Certificates due, ${input.firstName}`,
      intro,
      rows,
      rowsLead: `${n} propert${n === 1 ? "y" : "ies"} on your book`,
      rowHref: link,
      button: "Open Compliance",
      link,
      hero: "hero-certificates.png",
      tip: "If a property on this list isn't yours any more, say so - it means the record is wrong, and the landlord may be getting chased by nobody.",
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
    html: skyListShell({
      heading: "Your own compliance",
      intro,
      rows,
      rowsLead: "Worst first",
      rowHref: link,
      button: "Open your profile",
      link,
      hero: "hero-own-compliance.png",
      tip: "Michael checks it from his side. Only his tick reads as checked.",
      tipQuiet: true,
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
    /* One line each. A stalled deal trips two or three checks at once, and
       joined with dots they read as one long sentence about nothing. */
    details: g.map((a) => a.text),
    tone: g[0].tone === "attention" ? "attention" : "good",
  });
  const rows = [...attention.map(row), ...good.map(row)];
  const n = alerts.length;
  const subject = `Pre-tenancy: ${n} thing${n === 1 ? "" : "s"} to look at`;
  /* Two halves, each in its own colour, so the shape of the morning reads
     before a single row does. */
  const lead: { text: string; tone?: "attention" | "good" }[] = [];
  if (attention.length) {
    lead.push({
      text: good.length
        ? `${attention.length} need${attention.length === 1 ? "s" : ""} a look`
        : `${attention.length} propert${attention.length === 1 ? "y needs" : "ies need"} a look`,
      tone: "attention",
    });
  }
  if (good.length) {
    lead.push({
      text: attention.length
        ? `${good.length} started paying`
        : `${good.length} tenanc${good.length === 1 ? "y has" : "ies have"} started paying`,
      tone: "good",
    });
  }
  const link = `${SITE}/pre-tenancy/dashboard`;
  return {
    subject,
    html: skyListShell({
      heading: "This morning's pre-tenancy",
      intro:
        "Each of these is a disagreement between what the pipeline says and what PayProp shows. Nothing here is a tick somebody made - it is money and paperwork that did or did not arrive.",
      rows,
      rowsLead: lead,
      /* Cards rather than one panel: this is the only list with two kinds of
         thing in it, and which kind a row is should be readable before the
         row is. */
      rowCards: true,
      /* Heading first here: the drawing illustrates a morning the heading has
         already named, so it reads better once you know what it is of. */
      headingFirst: true,
      rowHref: link,
      button: "Open the board",
      link,
      hero: "hero-digest.png",
      tip: "A property drops off the list by itself once the record and the money agree.",
      tipQuiet: true,
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
    html: skyListShell({
      /* The ADDRESS is the heading and the event is the line under it. An
         agent with six deals on knows which one this is by the address long
         before they know which of the six events it was. */
      heading: e.property,
      intro: `${sentence}.`,
      rows: [
        {
          title: "What happens next",
          detail: next.replace(/^Next:\s*/, "").replace(/^./, (c) => c.toUpperCase()),
          tone: e.event === "cancelled" ? "attention" : "good",
        },
      ],
      button: "Open my applications",
      link,
      hero: "hero-deal-moved.png",
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
