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
  /**
   * The landlord's own pre-appraisal deck, if one has been minted for this
   * visit. Null means the email goes out as it always did — the link is an
   * addition to a working email, never a dependency of it.
   */
  presentationUrl?: string | null;
};

const first = (name: string) => (name || "there").trim().split(/\s+/)[0];

/**
 * The day and the time apart, so each can sit on its own line. From the ISO
 * start where there is one, pinned to UK time so a browser elsewhere cannot
 * move it; otherwise split out of whenPretty, which reads "Tuesday 20 October
 * at 2:00pm".
 */
function dayAndTime(i: AppraisalInvite): { day: string; time: string } {
  const start = i.startsAt ? new Date(i.startsAt) : null;
  if (start && !Number.isNaN(start.valueOf())) {
    const day = start.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
    const time = start
      .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, "")
      .toLowerCase();
    return { day, time };
  }
  const [day, time] = (i.whenPretty || "").split(/\s+at\s+/);
  return { day: day || "", time: time || "" };
}

/** "See you on Tuesday" - the weekday alone, capitalised as a name is. */
const weekdayOf = (i: AppraisalInvite) => dayAndTime(i).day.split(" ")[0] || "";

export function subjectFor(i: AppraisalInvite): string {
  return `Before your valuation - ${i.address}`;
}

/**
 * The day before. Generic on purpose (James, 16 Sep 2026): nothing about a
 * phone call or "today", because the booking may have come any way at all.
 *
 * The pre-presentation is a BUTTON straight to /present/<token>, which opens
 * without an account - a landlord has nothing to set up until after the
 * valuation. The marks are renderPlain's: [Label](url) and **bold**.
 */
export function bodyFor(i: AppraisalInvite): string {
  const { day, time } = dayAndTime(i);
  const when = day ? ` on **${day}${time ? ` at ${time}` : ""}**` : "";
  const weekday = weekdayOf(i);

  const deck = i.presentationUrl
    ? `Before we meet, I've put together a short pre-presentation for you. It covers who's coming, what happens on the day, how long it takes, and a few things that might help with any questions you have about the valuation.

[View your pre-presentation](${i.presentationUrl})

It opens straight away, there's nothing to sign up for.`
    : `It usually takes ${lengthWords(i.minutes)}. I'll walk round with you, take a few notes, and we'll talk through what it should let for and how quickly.`;

  return `Hi ${first(i.landlordName)},

I'm looking forward to seeing you at **${i.address}**${when}.

${deck}

If you have your EPC or any gas and electrical certificates to hand, they help, but none of it is essential.

If the time no longer works, just reply to this email${i.agentPhone ? ` or ring me on ${i.agentPhone}` : ""} and we'll move it.

${weekday ? `See you on ${weekday},` : "See you soon,"}
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
export function icsFor(i: AppraisalInvite, stampAt?: string | null): string | null {
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
    /**
     * When the calendar object itself was written — not when the visit is.
     *
     * Takes `stampAt` when the caller has a fixed moment to hand, and this is
     * not housekeeping: rendered server-side and client-side, `new Date()`
     * gives two different answers, React sees two different hrefs, and the
     * whole slide fails to hydrate. The presentation passes the deck's own
     * creation time, which is genuinely what DTSTAMP means.
     */
    `DTSTAMP:${stamp(stampAt ? new Date(stampAt) : new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    fold(`SUMMARY:Market appraisal - ${i.address}`),
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
  /**
   * Their own file, where the presentation and the terms both live.
   *
   * James, 14 Sep 2026: "the after-visit email should have a link to their
   * profile for them to view the presentation ... this will give you the
   * presentation and the terms of business."
   *
   * One link rather than two attachments, because the deck and the contract
   * are the same conversation and a landlord who has to keep two emails
   * straight loses one of them. Null leaves the paragraph out entirely - an
   * email promising a link it does not carry is worse than one that never
   * mentioned it.
   */
  fileUrl?: string | null;
};

const pcm = (n: number | null) => (n == null ? null : `£${n.toLocaleString("en-GB")} pcm`);

/** UK VAT, the one rate a lettings fee carries. */
export const VAT_RATE = 0.2;

/** A rate before VAT as the landlord pays it: 10 -> "12", 12 -> "14.4". */
export const incVat = (pct: number) => String(Math.round(pct * (1 + VAT_RATE) * 100) / 100);

export function postSubjectFor(i: AppraisalInvite): string {
  return `Your appraisal - ${i.address}`;
}

/**
 * The same email for every landlord (James, 16 Sep 2026): the price, the fee,
 * the presentation, let me know. Nothing that only fits one conversation - no
 * "you were hoping for", no availability date, and never the agent's own notes,
 * which are written for the agent and once read "weighing us against one other
 * agent" to the landlord. askingRent, availableFrom and summary are still
 * passed in by the callers and deliberately not used.
 */
export function postBodyFor(i: AppraisalInvite, f: AppraisalOutcomeFacts): string {
  const figure = pcm(f.valuation);
  const facts = [
    figure && `Suggested rent: **${figure}**`,
    /* The figure a landlord actually pays, VAT in (James, 16 Sep 2026: "always
       include the figure inclusive of that, not excluding it"). The file holds
       the rate before VAT, as the terms of business do. */
    f.feePercent != null && `Our fee: **${incVat(f.feePercent)}% of the rent, including VAT**`,
  ].filter(Boolean) as string[];

  const lines: string[] = [`Hi ${first(i.landlordName)},`, "", `Thanks for showing me round ${i.address}.`, ""];

  if (facts.length) lines.push("Here's where we landed:", "", facts.join("\n"), "");

  if (f.fileUrl) {
    lines.push(
      "Everything we went through is in your presentation, with our terms of business alongside it, so you can read it at your own pace.",
      "",
      `[View your presentation](${f.fileUrl})`,
      "",
      "Have a look and let me know what you think. If you have any questions, just reply to this email.",
      ""
    );
  } else {
    lines.push("Have a think and let me know what you'd like to do. If you have any questions, just reply to this email.", "");
  }

  lines.push("Kind regards,", i.agentName, "The Letting Experts");
  return lines.join("\n");
}

/**
 * The confirmation, sent the moment it is booked.
 *
 * A DIFFERENT email from the pre-appraisal, and the split is the point. This
 * one exists to put the appointment in writing the moment it is booked -
 * however it was booked, so it never assumes a phone call (James, 16 Sep
 * 2026). It
 * is short on purpose: a confirmation that runs to six paragraphs is a
 * confirmation nobody reads to the end of, and the detail has its own email
 * the day before.
 *
 * The calendar invite rides WITH this one, not with the pre-appraisal. An
 * .ics that arrives the day before the visit has missed most of its job.
 */
/**
 * How far ahead of the visit the pre-appraisal goes out.
 *
 * ONE day, set by James on 31 Aug 2026: *"the day before the valuation they
 * will be sent a pre-appraisal out"*. It was two, on the reasoning that this
 * left time to dig out an EPC — but the pre-appraisal deck carries no
 * homework any more, it is a sneak peek at who is coming, so its job is to be
 * fresh in the mind rather than to prompt anything.
 *
 * A NAMED CONSTANT because the old value was a bare `- 2` in a date
 * calculation with the number "two days" written into six separate strings
 * around it. Changing the offset used to mean finding all seven.
 */
export const PRE_APPRAISAL_LEAD_DAYS = 1;

/** "the day before" / "two days before" — said the same way everywhere. */
export const PRE_APPRAISAL_LEAD_WORDS =
  PRE_APPRAISAL_LEAD_DAYS === 1 ? "the day before" : `${PRE_APPRAISAL_LEAD_DAYS} days before`;

export function confirmSubjectFor(i: AppraisalInvite): string {
  return `Confirmed - your market appraisal${i.whenPretty ? `, ${i.whenPretty}` : ""}`;
}

/** "about an hour", as a person says it, not "about 60 minutes". */
function lengthWords(mins: number): string {
  if (mins === 60) return "about an hour";
  if (mins === 90) return "about an hour and a half";
  if (mins >= 120 && mins % 60 === 0) return `about ${mins / 60} hours`;
  if (mins === 30) return "about half an hour";
  return `about ${mins} minutes`;
}

/**
 * `calendarLines` puts Add to my calendar buttons in the body (lib/calendar-
 * links, 17 Sep 2026) in place of the line about an attachment, which people
 * missed. Without them - a preview on a screen that cannot sign a link - the
 * words stay as they were.
 */
export function confirmBodyFor(i: AppraisalInvite, calendarLines?: string): string {
  const { day, time } = dayAndTime(i);
  const rows = [
    day && `Date: **${day}**`,
    time && `Time: **${time}**`,
    `Where: **${i.address}**`,
    `With: **${i.agentName}**`,
  ].filter(Boolean);
  return `Hi ${first(i.landlordName)},

Thanks for booking in. Putting this in writing so you have it:

${rows.join("\n")}

${calendarLines ? `It takes ${lengthWords(i.minutes)}. Press the button to put it straight in your diary.

${calendarLines}` : `It takes ${lengthWords(i.minutes)}, and the calendar invite is attached so it goes straight in your diary.`}

There's nothing you need to do before then. ${PRE_APPRAISAL_LEAD_WORDS.replace(/^./, (c) => c.toUpperCase())}, I'll send you a short pre-presentation so you know who's coming and what happens on the day.

If the time stops working, just ${i.agentPhone ? `reply or ring me on ${i.agentPhone}` : "reply to this email"} and we'll move it.

Kind regards,
${i.agentName}
The Letting Experts`;
}
