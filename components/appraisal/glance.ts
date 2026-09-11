import type { MarketAppraisal, MaStage } from "@/lib/market-appraisal";
import { PRE_APPRAISAL_LEAD_WORDS } from "@/lib/appraisal-email";

/**
 * At a glance: three facts, chosen by the stage (James, 11 Sep 2026: "it
 * should change based on the stage that they're at... taking stock of each
 * appraisal, going 'cool, here's what has and hasn't happened'").
 *
 * Always three, so the hero never changes height between files. Everything
 * here is read off the record and its ticks - nothing is typed in - and the
 * words follow the clock: a visit is "on Friday" until the day, "today at
 * 2pm" on the day, "completed" after.
 */

export interface GlanceItem {
  icon: string;
  title: string;
  sub: string;
}

export interface GlanceDecks {
  deck: boolean;
  post: { opens: number } | null;
}

export interface GlanceFile {
  held: number;
  outstanding: number;
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const longDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function glanceFor(
  ma: MarketAppraisal,
  stage: MaStage,
  decks: GlanceDecks | null | undefined,
  file: GlanceFile | null | undefined,
  now = new Date()
): GlanceItem[] {
  const tick = (id: string) => (ma.ticks ?? []).find((t) => t.id === id);
  const done = (id: string) => Boolean(tick(id)?.done);
  const when = ma.appointmentAt ? new Date(ma.appointmentAt) : null;
  const passed = Boolean(when && when < now);

  /* ── the visit, said by the clock ── */
  const visit: GlanceItem = !when || !ma.appointmentAt
    ? { icon: "calendar", title: "No date on this appraisal", sub: "Booked without one - worth chasing" }
    : passed
      ? { icon: "calendar", title: "Visit completed", sub: `${longDay(ma.appointmentAt)} at ${clock(ma.appointmentAt)}${ma.agent ? ` · ${ma.agent}` : ""}` }
      : sameDay(when, now)
        ? { icon: "calendar", title: `Visit today at ${clock(ma.appointmentAt)}`, sub: ma.agent ? `with ${ma.agent}` : "In the diary" }
        : { icon: "calendar", title: `Visit on ${shortDay(ma.appointmentAt)} at ${clock(ma.appointmentAt)}`, sub: `${Math.ceil((when.getTime() - now.getTime()) / 86_400_000)} day${Math.ceil((when.getTime() - now.getTime()) / 86_400_000) === 1 ? "" : "s"} away${ma.agent ? ` · ${ma.agent}` : ""}` };

  /* ── the pre-presentation ── */
  const ps = ma.preSend;
  const pre: GlanceItem = ps?.state === "sent"
    ? { icon: "mail", title: "Pre-presentation sent", sub: `${ps.at ? shortDay(ps.at) : "Sent"}${ps.opens ? ` · opened ${ps.opens} time${ps.opens === 1 ? "" : "s"}` : " · not opened yet"}` }
    : ps?.state === "queued" && ps.at
      ? { icon: "mail", title: `Pre-presentation goes out ${shortDay(ps.at)}`, sub: `${PRE_APPRAISAL_LEAD_WORDS} the visit, at ${clock(ps.at)}` }
      : !ma.landlordEmail
        ? { icon: "mail", title: "Pre-presentation cannot go out", sub: "No email for the landlord on this file" }
        : passed
          ? { icon: "mail", title: "Pre-presentation not sent", sub: "The visit has been" }
          : { icon: "mail", title: "Pre-presentation being prepared", sub: `Goes out ${PRE_APPRAISAL_LEAD_WORDS} the visit` };

  /* ── the video ── */
  const video: GlanceItem = ma.videoState === "recorded"
    ? { icon: "magic-wand", title: "Personalised video recorded", sub: "On the front of the pre-presentation" }
    : ma.videoState === "declined"
      ? { icon: "magic-wand", title: "Sending without a video", sub: "Chosen on this file" }
      : { icon: "magic-wand", title: "No personalised video recorded", sub: ma.nudgeAt ? `Reminder to you ${shortDay(ma.nudgeAt)}` : "Record one, or send without" };

  /* ── the figure ── */
  const figure: GlanceItem = ma.valuation != null
    ? { icon: "doc", title: `${gbp(ma.valuation)} pcm recorded`, sub: `Valued${ma.valuedAt ? ` ${shortDay(ma.valuedAt)}` : ""}${ma.valuedBy ? ` by ${ma.valuedBy}` : ""}` }
    : { icon: "doc", title: "No figure recorded yet", sub: passed ? "Add a figure to move to the next stage" : "Comes from the visit" };

  /* ── the decks after the visit ── */
  const presentation: GlanceItem = decks === undefined
    ? { icon: "magic-wand", title: "Reading the decks…", sub: "" }
    : decks?.deck
      ? { icon: "magic-wand", title: "Presentation built", sub: "The deck you take with you on the day" }
      : { icon: "magic-wand", title: "No presentation built yet", sub: "Build it before the visit" };
  const post: GlanceItem = decks === undefined
    ? { icon: "file-contract", title: "Reading the decks…", sub: "" }
    : decks?.post
      ? { icon: "file-contract", title: "Post-appraisal deck sent", sub: decks.post.opens ? `Opened ${decks.post.opens} time${decks.post.opens === 1 ? "" : "s"}` : "Not opened yet" }
      : { icon: "file-contract", title: "Post-appraisal deck not sent", sub: "The figure, the terms and the deck they saw" };

  /* ── terms and documents ── */
  const terms: GlanceItem = done("terms-signed")
    ? { icon: "file-contract", title: "Terms signed", sub: tick("terms-signed")?.detail ?? "Signed" }
    : done("terms-sent")
      ? { icon: "file-contract", title: "Terms out for signature", sub: "Waiting on the landlord" }
      : { icon: "file-contract", title: "Terms not sent yet", sub: "Sent from the post-appraisal step" };
  const docs: GlanceItem = done("id") && done("ownership")
    ? { icon: "shield", title: "ID and ownership on the portal", sub: "Both uploaded by the landlord" }
    : done("id") || done("ownership")
      ? { icon: "shield", title: done("id") ? "ID on the portal, ownership to come" : "Ownership on the portal, ID to come", sub: "One of two uploaded" }
      : { icon: "shield", title: "No ID or ownership yet", sub: "The landlord uploads both on their portal" };
  const certs: GlanceItem = file === undefined
    ? { icon: "folder", title: "Reading the property file…", sub: "" }
    : file === null
      ? { icon: "folder", title: "Property file unavailable", sub: "The file could not be read" }
      : file.held === 0
        ? { icon: "folder", title: "No property file", sub: "Attach any relevant documents" }
        : { icon: "folder", title: `${file.held} certificate${file.held === 1 ? "" : "s"} on file`, sub: file.outstanding > 0 ? `${file.outstanding} still outstanding` : "Everything required is in date" };

  switch (stage) {
    case "booked":
    case "pre_appraisal":
      return [pre, video, visit];
    case "appraisal":
      return [visit, presentation, passed ? figure : pre];
    case "post_appraisal":
      return [figure, post, terms];
    case "takeon":
      return [terms, figure, certs];
    case "aml":
      return [docs, certs, terms];
    case "won":
      return [{ icon: "star", title: "Won", sub: done("listed") ? "Listed in REX" : "Marked won on this file" }, figure, terms];
    case "lost":
      return [{ icon: "cross", title: "Marked lost", sub: "Reopen it from the top of the page if they call back" }, visit, figure];
  }
}
