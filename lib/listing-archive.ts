/**
 * WHEN A DRAFT STOPS BEING WORK AND BECOMES HISTORY.
 *
 * The rental book carries 268 current rentals and 167 of them are drafts that
 * have never been on a portal (measured against REX, 14 Sep 2026). A Draft tab
 * with 159 rows in it is not a list of jobs, it is a wall, and the eleven
 * drafts somebody is actually working on this week are lost inside it. James,
 * 14 Sep 2026: "anything older than 2 months should be archived... anything
 * that's longer than 2 months in the draft section, we can add them into a
 * separate area where they become searchable if they ever get brought back up."
 *
 * So: two months is the cap. Past it, a draft leaves the working list for the
 * archive - where it is still searchable, still openable, and one button from
 * coming back. NOTHING IS DELETED AND NOTHING IS WRITTEN TO REX. The archive
 * is a view of the same book, which is why an agent can be wrong about it
 * without any harm done.
 *
 * ── WHICH DATE THE TWO MONTHS IS MEASURED FROM ────────────────────────────
 *
 * The created date, not the last-modified date, and this was checked rather
 * than assumed. On 14 Sep 2026, 91 drafts had been "touched in the last 30
 * days" - but 71 of them shared a single modtime, 6 Sep, which is a bulk sync
 * rather than 71 people working. One of those 71 was created in February 2024.
 * Ageing by modtime would have kept a two-year-old shell in the working list
 * because a background job brushed past it, and it would have done that again
 * on the next sync. The created date never moves and answers the real
 * question: how long has this been sitting here unpublished.
 *
 * ── WHAT IS SAFE TO ARCHIVE ───────────────────────────────────────────────
 *
 * Only a listing that has NEVER been published and is NOT let agreed. A live
 * advert is the agency's shop window and a let-agreed property is a tenancy in
 * progress; neither is ever hidden by age. A published listing leaves the
 * board the way it always has - by being let, or by being withdrawn in REX.
 */

/** Two months, as James asked for it. One number, read everywhere. */
export const ARCHIVE_AFTER_DAYS = 60;

/** What put this listing in the archive. */
export type ArchiveReason =
  /** Never published, and older than the cap. */
  | "stale-draft"
  /** An agent archived it early. */
  | "by-hand"
  /** Withdrawn in REX - it came off the market with nobody in it. */
  | "withdrawn";

export interface ArchiveState {
  archived: boolean;
  reason: ArchiveReason | null;
  /** The date the archiving is reckoned from, ISO - shown as "Drafted <date>". */
  since: string | null;
  /** How many days old, by that date. Null when we have no date to go on. */
  ageDays: number | null;
}

/** The override an agent has set by hand, if any. */
export interface ArchiveOverride {
  /** "archived" - put away early. "restored" - pulled back into drafts. */
  state: "archived" | "restored";
  /** When they did it, ISO. A restore RESETS the clock; see below. */
  at: string;
}

/** The shape the rule needs. Deliberately minimal so both the board's row type
 *  and the server's OsListing satisfy it without either importing the other. */
export interface ArchivableListing {
  letAgreed: boolean;
  publicationStatus: string | null;
  createdAt?: string | null;
  listingState?: string | null;
  stateDate?: string | null;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.floor((Date.now() - at) / 86_400_000);
}

/**
 * Where this listing stands.
 *
 * ── Why a restore resets the clock rather than pinning the listing ────────
 *
 * "We can draft them" means a listing comes back into the working list. But
 * the rule that archived it is about AGE, and the created date does not change
 * when somebody restores it - so a naive restore would be undone by the same
 * rule on the very next page load, and the button would look broken.
 *
 * Pinning it out of the archive forever is the other easy answer and it is
 * worse: it re-creates the wall one exemption at a time, and the exemptions
 * are invisible.
 *
 * So a restore gives the listing a fresh two months. Somebody wanted it back;
 * they get the same run at it as a brand new draft, and if nothing happens it
 * goes quietly back to the archive. Self-healing, and nobody has to remember
 * to tidy up.
 */
export function archiveOf(l: ArchivableListing, override?: ArchiveOverride | null): ArchiveState {
  /* Withdrawn is REX's own word for "this came off the market". It is not our
     rule and it cannot be undone from here, so it is checked first and a hand
     override never contradicts it. */
  if (l.listingState === "withdrawn") {
    return { archived: true, reason: "withdrawn", since: l.stateDate ?? l.createdAt ?? null, ageDays: daysSince(l.stateDate ?? l.createdAt) };
  }

  /* A live advert or a tenancy in progress is never archived by age, and an
     agent cannot archive one by hand either - the button is not offered, and
     this is the second lock in case it ever is. */
  const eligible = !l.letAgreed && l.publicationStatus !== "published";
  if (!eligible) return { archived: false, reason: null, since: null, ageDays: null };

  if (override?.state === "archived") {
    return { archived: true, reason: "by-hand", since: override.at.slice(0, 10), ageDays: daysSince(override.at) };
  }

  const from = override?.state === "restored" ? override.at.slice(0, 10) : l.createdAt ?? null;
  const age = daysSince(from);
  if (age != null && age > ARCHIVE_AFTER_DAYS) {
    return { archived: true, reason: "stale-draft", since: from, ageDays: age };
  }
  /* No created date means no age, and a listing is never archived on a guess. */
  return { archived: false, reason: null, since: from, ageDays: age };
}

/** What the archive row says it is. */
export function archiveLabel(reason: ArchiveReason | null): string {
  if (reason === "withdrawn") return "Taken off the market";
  if (reason === "by-hand") return "Archived";
  if (reason === "stale-draft") return "Draft, gone cold";
  return "";
}

/** The one line under it, saying why it is here. */
export function archiveWhy(s: ArchiveState): string {
  const when = s.since
    ? new Date(`${s.since}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  if (s.reason === "withdrawn") return when ? `Came off without a tenant, ${when}.` : "Came off the market without a tenant.";
  if (s.reason === "by-hand") return when ? `Put away by hand, ${when}.` : "Put away by hand.";
  if (s.reason === "stale-draft") {
    const months = s.ageDays == null ? null : Math.round(s.ageDays / 30);
    return when
      ? `Drafted ${when}${months ? ` - ${months} months and never published` : ""}.`
      : "Never published.";
  }
  return "";
}
