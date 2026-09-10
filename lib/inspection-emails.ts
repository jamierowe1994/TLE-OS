import "server-only";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { msConnectionFor, msSendMail, MailboxNotConnected } from "@/lib/microsoft";
import { switchOn } from "@/lib/switches";
import { kindLabel, type Finding, type Inspection } from "@/lib/inspections";
import type { OsUser } from "@/lib/users";

/**
 * The three emails an inspection sends.
 *
 *   tenant   inspection-tenant-access   we are asking to come, here are dates
 *            inspection-tenant-booked   the date, in writing, which is notice
 *   landlord inspection-landlord-report what we found
 *
 * Best effort, after the move is saved, exactly as maintenance does it: a
 * missing address or a refused send comes back as a sentence for the
 * timeline and the move stands. The outcome goes ON the inspection, because
 * "was the tenant actually asked?" is the question this whole screen exists
 * to answer, and it must never be answered by guessing.
 */

export interface SendOutcome {
  to: "tenant" | "landlord";
  sent: boolean;
  address?: string;
  reason?: string;
  via?: string;
}

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "a time to be agreed";

const CONDITION_WORD: Record<string, string> = {
  good: "in good order",
  fair: "reasonable, with a few things to sort",
  poor: "not being kept as it should be",
};

/** How long we tell the tenant it takes. Short, honest, and not a promise about the report. */
const HOW_LONG: Record<string, string> = {
  check_in: "45 minutes",
  interim: "20 minutes",
  hmo: "30 minutes",
  void: "15 minutes",
  check_out: "45 minutes",
  follow_up: "15 minutes",
};

function varsFor(i: Inspection, me: OsUser, findings: Finding[] = []): Record<string, string> {
  const address = [i.propertyName, i.locality].filter(Boolean).join(", ");
  return {
    ref: String(i.ref),
    address,
    kind: kindLabel(i.kind),
    tenantName: first(i.tenant),
    landlordName: first(i.landlord),
    inspector: i.inspector || me.name || "One of the team",
    howLong: HOW_LONG[i.kind] ?? "20 minutes",
    noticeHours: String(i.noticeHours),
    whenPretty: when(i.bookedAt ?? i.visitedAt),
    slots: i.offered.map((o) => when(o)).join("<br>"),
    accessLink: `${ORIGIN}/visit/${i.accessToken ?? ""}`,
    reportLink: `${ORIGIN}/inspections?open=${encodeURIComponent(i.id)}`,
    conditionWord: CONDITION_WORD[i.condition ?? "good"] ?? "in good order",
    summary: i.summary,
    findings:
      findings.length === 0
        ? "Nothing that needs doing."
        : findings
            .map((f) => `${[f.room, f.item].filter(Boolean).join(" - ")}${f.note ? `: ${f.note}` : ""}`)
            .join("<br>"),
    agentName: me.name || "The Letting Experts",
    agentEmail: me.email,
  };
}

/** The same send path maintenance uses: their own mailbox when it is connected, the public sender otherwise. */
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
      /* Their mailbox refused: fall through to the public sender rather than
         lose the email, and say so on the timeline. */
    }
  }
  try {
    await sendEmail({ to: address, subject, html, audience: "customer", replyTo: me.email });
    return { to: who, sent: true, address, via: "public sender" };
  } catch (e) {
    return { to: who, sent: false, address, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/** Which emails a move earns, decided in one place rather than at each route. */
export async function emailsForMove(
  i: Inspection,
  action: string,
  me: OsUser,
  findings: Finding[] = []
): Promise<SendOutcome[]> {
  /* A rehearsal inspection never emails anybody. Maintenance keeps its
     rehearsal post in a table so the walkthrough can show it; inspections
     have no walkthrough yet, so silence is the safe half of that. */
  if (i.rehearsal) return [];
  const vars = varsFor(i, me, findings);
  const out: SendOutcome[] = [];
  if (action === "ask_access" && i.accessToken) out.push(await send("inspection-tenant-access", i.tenantEmail, vars, me, "tenant"));
  if (action === "confirm" && i.bookedAt) out.push(await send("inspection-tenant-booked", i.tenantEmail, vars, me, "tenant"));
  if (action === "report_sent" && i.reportedAt) out.push(await send("inspection-landlord-report", i.landlordEmail, vars, me, "landlord"));
  return out;
}

export const outcomeLine = (o: SendOutcome): string =>
  o.sent
    ? `The ${o.to} was emailed at ${o.address}${o.via ? ` from the ${o.via}` : ""}.`
    /* The reason is a sentence in its own right and often ends in a full
       stop already - "...Turn it on there to send this." - so trim before
       adding one, or the timeline reads "send this..". */
    : `The ${o.to} was NOT emailed: ${(o.reason ?? "no reason given").replace(/\.+$/, "")}.`;
