/**
 * The pre-appraisal confirmation.
 *
 * The single highest-value email the lettings side sends: it is what stops the
 * no-shows, the "I'd forgotten" and the landlord who didn't know they needed
 * the EPC to hand. So it is written as a person would write it — what's
 * happening, when, who's coming, what to have ready — rather than as a
 * template with slots.
 *
 * It is composed here, as data, so the same words can go out by REX mail merge
 * or be copied into Outlook, and so the wording is one file to change rather
 * than a string buried in a component.
 */

export type AppraisalInvite = {
  landlordName: string;
  address: string;
  /** As it should read to a human: "Tuesday 19 August at 2:00pm". */
  whenPretty: string;
  /** ISO start, for the calendar file. Null means nothing is in the diary. */
  startsAt: string | null;
  minutes: number;
  agentName: string;
  agentPhone: string;
};

const first = (name: string) => (name || "there").trim().split(/\s+/)[0];

export function subjectFor(i: AppraisalInvite): string {
  return `Your market appraisal — ${i.address}${i.whenPretty ? `, ${i.whenPretty}` : ""}`;
}

export function bodyFor(i: AppraisalInvite): string {
  return `Hi ${first(i.landlordName)},

Thanks for your time on the phone. I'm looking forward to seeing ${i.address}${
    i.whenPretty ? ` on ${i.whenPretty}` : ""
  }.

It usually takes about ${i.minutes} minutes. I'll walk round the property, take a few notes, and we'll talk through what it should let for, how quickly, and what — if anything — is worth doing first.

To make the most of it, it helps to have to hand:

  • the EPC, if you already have one
  • any gas safety or electrical certificates
  • rough dates for when you'd want it available
  • anything you already know needs doing

None of it is essential — if you haven't got it, we'll sort it afterwards.

If the time no longer works, just reply to this email or ring me on ${i.agentPhone} and we'll move it.

See you ${i.whenPretty ? i.whenPretty.split(" ")[0].toLowerCase() : "soon"},
${i.agentName}
The Letting Experts`;
}

/**
 * A calendar invite, as a real .ics.
 *
 * Deliberately not dependent on REX or on a mail provider — the file is
 * generated here, so "put it in their diary" works on any environment,
 * including the ones where sending is still locked.
 */
export function icsFor(i: AppraisalInvite): string | null {
  if (!i.startsAt) return null;
  const start = new Date(i.startsAt);
  if (Number.isNaN(start.valueOf())) return null;
  const end = new Date(start.valueOf() + i.minutes * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // Folded per RFC 5545: long lines break at 75 octets, and Outlook is fussy.
  const fold = (line: string) =>
    line.length <= 74 ? line : line.match(/.{1,74}/g)!.join("\r\n ");
  const uid = `ma-${start.valueOf()}-${i.address.replace(/\W+/g, "")}@thelettingsexperts`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Letting Experts//TLE OS//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    fold(`SUMMARY:Market appraisal — ${i.address}`),
    fold(`DESCRIPTION:With ${i.agentName}, The Letting Experts. Any problems, ring ${i.agentPhone}.`),
    fold(`LOCATION:${i.address}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * The follow-up, after the visit.
 *
 * Written from what was actually recorded on the day rather than from a
 * template with slots, because the whole value of it is that it repeats their
 * property back to them: the number, the reasoning, what they said they
 * wanted. A landlord comparing three agents keeps the one that put it in
 * writing first.
 */
export type AppraisalOutcomeFacts = {
  valuation: number | null;
  askingRent: number | null;
  feePercent: number | null;
  availableFrom: string | null;
  summary: string;
};

const pcm = (n: number | null) => (n == null ? null : `£${n.toLocaleString("en-GB")} pcm`);

export function postSubjectFor(i: AppraisalInvite): string {
  return `Your appraisal — ${i.address}`;
}

export function postBodyFor(i: AppraisalInvite, f: AppraisalOutcomeFacts): string {
  const figure = pcm(f.valuation);
  const asked = pcm(f.askingRent);
  const lines: string[] = [
    `Hi ${first(i.landlordName)},`,
    "",
    `Thanks for your time today, and for showing me round ${i.address}.`,
    "",
  ];

  if (figure) {
    lines.push(
      asked && asked !== figure
        ? `In writing, as promised: I'd put it on the market at ${figure}. You mentioned you were hoping for ${asked} — that's not far off, and it's worth a conversation about what would close the gap.`
        : `In writing, as promised: I'd put it on the market at ${figure}.`
    );
  } else {
    lines.push("In writing, as promised — here's where we got to.");
  }
  lines.push("");

  if (f.summary.trim()) {
    lines.push(f.summary.trim(), "");
  }
  if (f.feePercent != null) {
    lines.push(
      `Our fee would be ${f.feePercent}% of the rent, which covers the marketing, the viewings, the referencing and the paperwork.`,
      ""
    );
  }
  if (f.availableFrom) {
    lines.push(`You said you'd want it available from ${f.availableFrom}.`, "");
  }

  lines.push(
    "If you'd like to go ahead, I'll send the terms over and we can get the photos booked. If you're still weighing it up, that's completely fine — tell me what would help and I'll get it to you.",
    "",
    `Either way, ring me on ${i.agentPhone} if anything's easier said than written.`,
    "",
    "Kind regards,",
    i.agentName,
    "The Letting Experts"
  );
  return lines.join("\n");
}
