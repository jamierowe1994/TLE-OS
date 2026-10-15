import { NextRequest, NextResponse, after } from "next/server";
import { hasDb, q } from "@/lib/db";
import type { Appt, ApptKind } from "@/lib/diary";
import { heldDiary, refreshDiaryBook } from "@/lib/diary-cache";
import { londonDayOffset } from "@/lib/london-time";
import { feedEntry, feedIcs, feedOwner, noteFeedCollected, type FeedEntry } from "@/lib/personal-calendar";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/calendar/feed/<token>.ics - one person's OS diary as a calendar
 * their PERSONAL calendar subscribes to (lib/personal-calendar).
 *
 * Public, because Google and Apple collect it with no session: the long
 * random token in the address is the only key, made and reset from Profile,
 * and only its hash is stored. A locked-out account's link stops at once
 * (feedOwner).
 *
 * Their own diary only, the same entries /api/diary shows them: their REX
 * calendar (matched on the mailbox, never the name) and what they booked in
 * the OS. Times, address and kind; no names, phone numbers or emails.
 *
 * A REX diary that cannot be read is a 503, not an empty calendar: a calendar
 * app keeps its last copy on an error, but would wipe the agent's week on an
 * empty answer.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** What they booked in the OS, the same rows the diary route reads. */
async function ours(userId: string): Promise<FeedEntry[]> {
  const rows = await q<{ id: string; starts_at: Date; mins: number; kind: string; where_at: string }>(
    `SELECT id, starts_at, mins, kind, where_at
       FROM os_appointments
      WHERE author_id = $1
        AND rex_event_id IS NULL
        AND starts_at > NOW() - INTERVAL '21 days'
        AND starts_at < NOW() + INTERVAL '90 days'
      ORDER BY starts_at`,
    [userId]
  );
  return rows.flatMap((r) => {
    const kind = (["viewing", "appraisal", "takeon", "movein", "inspection", "travel", "other", "slot"].includes(r.kind) ? r.kind : "other") as ApptKind;
    const start = new Date(r.starts_at);
    const e = feedEntry(
      { id: `os-${r.id}`, day: 0, start: "00:00", mins: 0, kind, what: "", where: r.where_at ?? "", who: "", agent: "", comms: [] },
      start.getTime()
    );
    /* feedEntry works in book offsets; an OS row has a real instant, so set it straight. */
    return e ? [{ ...e, start, end: new Date(start.getTime() + Math.min(Math.max(r.mins || 30, 5), 8 * 60) * 60000) }] : [];
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw).replace(/\.ics$/i, "");
  if (!hasDb()) return new NextResponse("Not available.", { status: 404 });
  const person = await feedOwner(token).catch(() => null);
  if (!person) return new NextResponse("This calendar link isn't valid any more.", { status: 404 });

  const [mine, rexLogin] = await Promise.all([
    ours(person.id),
    q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [person.id]).catch(() => []),
  ]);
  let rex: FeedEntry[] = [];
  if (rexConfigured()) {
    let found = await heldDiary().catch(() => null);
    if (!found || londonDayOffset(found.at) !== 0) {
      found = await Promise.race([
        refreshDiaryBook(),
        new Promise<null>((res) => setTimeout(() => res(null), 20_000)),
      ]).catch(() => null);
    } else if (Date.now() - found.at > 15 * 60 * 1000) {
      after(() => refreshDiaryBook().then(() => undefined, () => undefined));
    }
    if (!found) return new NextResponse("The diary couldn't be read just now. Your calendar will try again.", { status: 503, headers: { "Retry-After": "900" } });
    const email = person.email.toLowerCase();
    const rexEmail = rexLogin[0]?.rex_email?.toLowerCase() ?? null;
    const theirs = found.book.appts.filter((a: Appt) => {
      const owner = (a.agentEmail ?? "").toLowerCase();
      return Boolean(owner) && (owner === email || owner === rexEmail);
    });
    const at = found.at;
    rex = theirs.flatMap((a) => {
      const e = feedEntry(a, at);
      return e ? [e] : [];
    });
  }

  after(() => noteFeedCollected(person.id));
  /* One booking, once. An OS booking sits in our table and in REX, and some
     people's REX pulls the OS's Outlook copy back in as well (lib/rex-outlook-
     sync): the same kind at the same time and place is one appointment. */
  const entries: FeedEntry[] = [];
  for (const e of [...mine, ...rex].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const twin = entries.some(
      (k) => k.kind === e.kind && Math.abs(k.start.getTime() - e.start.getTime()) <= 2 * 60000 && (!k.where || !e.where || k.where.toLowerCase() === e.where.toLowerCase())
    );
    if (!twin) entries.push(e);
  }
  return new NextResponse(feedIcs(entries, person.name || "My diary"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="tle-os-diary.ics"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
