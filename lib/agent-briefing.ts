/**
 * THE EMAIL THE AGENT GETS, not the landlord.
 *
 * ── Why this one exists, and why it can be sent today ─────────────────────
 *
 * The pre-appraisal deck is meant to go out on its own the day before a
 * visit. An agent who only finds that out when the landlord mentions it has
 * been ambushed by their own system — and, more practically, has missed the
 * one window in which a personalised welcome video was worth recording.
 *
 * So the OS tells them: here is what will go, here is when, and here is the
 * one thing only you can add.
 *
 * It is the half of the flow that WORKS TODAY. Landlord mail is blocked twice
 * over — lib/email-policy refuses every non-TLE domain at the transport, and
 * REX MailMerge refuses without REX_ALLOW_WRITES — but an agent is on a TLE
 * domain, so this passes the same guard that stops the other half. That is a
 * feature of the design rather than a gap in it.
 *
 * ── Plain text and HTML, both written here ────────────────────────────────
 *
 * Resend wants HTML; a person forwarding it to a colleague wants text that
 * survives. Both are built from the same facts so they cannot drift, and the
 * HTML is deliberately plain — no images, no tracking, nothing that makes an
 * internal note look like a marketing send and land in Focused-Other.
 */

export interface AgentBriefing {
  agentFirstName: string;
  landlordName: string;
  address: string;
  /** "Monday 1 September at 10:30", already human. Null if nothing is booked. */
  visitPretty: string | null;
  /** "Sunday 31 August", when the pre-appraisal is due to go. */
  sendPretty: string | null;
  /** Absolute URL of the appraisal file — where the video is recorded. */
  appraisalUrl: string;
  /** Absolute URL of the deck itself, so they can read what the landlord gets. */
  deckUrl: string | null;
}

const first = (name: string) => (name || "").trim().split(/\s+/)[0] || "there";

export function briefingSubject(b: AgentBriefing): string {
  return b.sendPretty
    ? `Your pre-appraisal for ${b.address} goes out ${b.sendPretty}`
    : `Your pre-appraisal for ${b.address}`;
}

/**
 * THE VIDEO PARAGRAPH, and the one thing it must not do.
 *
 * Two options were asked for: the standard Letting Experts clip, and a
 * personalised one recorded through Flow. The standard one is pulled from the
 * agent's own account, and that account does not exist yet — so this says the
 * personalised option and STAYS SILENT about the standard one rather than
 * describing a choice half of which cannot be made. An email offering two
 * options where one does nothing teaches people to ignore the other.
 *
 * When the standard clip exists, this is the paragraph it joins.
 */
function videoLines(b: AgentBriefing): string[] {
  return [
    "You can add a personalised welcome video to it — it takes about a minute, and it is the only part of that page that is yours rather than the office's.",
    `Record one here: ${b.appraisalUrl}`,
  ];
}

export function briefingText(b: AgentBriefing): string {
  const lines: string[] = [`Hi ${first(b.agentFirstName)},`, ""];

  if (b.sendPretty) {
    lines.push(
      `The pre-appraisal page for ${b.landlordName} at ${b.address} is due to go out on ${b.sendPretty}${
        b.visitPretty ? `, ahead of your visit on ${b.visitPretty}` : ""
      }.`
    );
  } else {
    lines.push(
      `The pre-appraisal page for ${b.landlordName} at ${b.address} is ready.${
        b.visitPretty ? ` Your visit is on ${b.visitPretty}.` : ""
      }`
    );
  }
  lines.push("");
  lines.push(...videoLines(b));

  if (b.deckUrl) {
    lines.push("", `This is exactly what they will see: ${b.deckUrl}`);
  }

  lines.push(
    "",
    "Nothing has been sent to the landlord — sending is switched off across the OS until it is signed off.",
    "",
    "TLE OS"
  );
  return lines.join("\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function briefingHtml(b: AgentBriefing): string {
  const p = (s: string) =>
    `<p style="margin:0 0 14px;font:400 15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#101014">${s}</p>`;

  const when = b.sendPretty
    ? `The pre-appraisal page for <strong>${esc(b.landlordName)}</strong> at <strong>${esc(
        b.address
      )}</strong> is due to go out on <strong>${esc(b.sendPretty)}</strong>${
        b.visitPretty ? `, ahead of your visit on ${esc(b.visitPretty)}` : ""
      }.`
    : `The pre-appraisal page for <strong>${esc(b.landlordName)}</strong> at <strong>${esc(
        b.address
      )}</strong> is ready.${b.visitPretty ? ` Your visit is on ${esc(b.visitPretty)}.` : ""}`;

  return [
    `<div style="max-width:560px">`,
    p(`Hi ${esc(first(b.agentFirstName))},`),
    p(when),
    p(
      "You can add a personalised welcome video to it &mdash; it takes about a minute, and it is the only part of that page that is yours rather than the office's."
    ),
    `<p style="margin:0 0 18px"><a href="${esc(b.appraisalUrl)}" style="display:inline-block;background:#a85a51;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font:600 14px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">Record a welcome video</a></p>`,
    b.deckUrl
      ? p(
          `This is exactly what they will see: <a href="${esc(b.deckUrl)}" style="color:#a85a51">open the page</a>.`
        )
      : "",
    `<p style="margin:18px 0 0;font:400 13px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6b6b70">Nothing has been sent to the landlord &mdash; sending is switched off across the OS until it is signed off.</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}
