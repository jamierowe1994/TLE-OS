import { londonDayOffset, londonHHMM } from "@/lib/london-time";
import { FRESH_MS, STALE_MS, heldDiary, refreshDiaryBook } from "@/lib/diary-cache";
import { NextRequest, NextResponse } from "next/server";
import { fetchDiary, type DiaryBook } from "@/lib/rex-diary";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";
import type { Appt, ApptKind } from "@/lib/diary";
import { scopeFor } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { osFeedbackFor } from "@/lib/viewing-feedback-store";
import { outlookDiaryFor, type OutlookRead } from "@/lib/outlook-diary";
import { noteRexOutlookSync } from "@/lib/rex-outlook-sync";

/**
 * The team's diary, cached — same manners as leads and listings.
 *
 * Held briefly (two minutes): a diary that is ten minutes stale is a diary
 * that shows a slot as free after somebody has taken it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Appointments made HERE, folded in beside the REX ones.
 *
 * These were being written and never read. `/api/appointments` had a GET that
 * nothing called, so an ad-hoc appointment — and, once buffers existed, a
 * travel block — vanished the moment its modal closed and reappeared nowhere.
 * A diary that silently drops what you put in it is worse than one that never
 * offered, because you stop checking.
 *
 * Read FRESH on every request rather than through the two-minute REX cache:
 * you have to see the thing you just saved, and the REX pull is the slow half
 * that the cache exists for. This is one indexed query against our own table.
 */
async function ours(authorId: string | null, selfId: string): Promise<Appt[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<{
      id: string; starts_at: Date; mins: number; kind: string;
      title: string; where_at: string; who: string; author_name: string; author_id: string | null;
    }>(
      `SELECT id, starts_at, mins, kind, title, where_at, who, author_name, author_id
         FROM os_appointments
        WHERE starts_at > NOW() - INTERVAL '21 days'
          AND starts_at < NOW() + INTERVAL '60 days'
          AND rex_event_id IS NULL
          AND ($1::text IS NULL OR author_id = $1)
        ORDER BY starts_at`,
      [authorId]
    );

    return rows.map((r) => {
      const at = new Date(r.starts_at);
      return {
        id: `os-${r.id}`,
        // Whole days apart on the LOCAL clock. Subtracting raw timestamps
        // gets this wrong twice a year: the day the clocks change is 23 or
        // 25 hours long, and /86400000 rounds it onto the wrong column.
        // ...and on the LONDON clock, not the server's (lib/london-time).
        day: londonDayOffset(at),
        start: londonHHMM(at),
        mins: Math.min(Math.max(r.mins || 30, 15), 8 * 60),
        kind: (["viewing", "appraisal", "takeon", "movein", "inspection", "travel", "other"]
          .includes(r.kind) ? r.kind : "other") as ApptKind,
        what: r.title,
        where: r.where_at ?? "",
        who: r.who ?? "",
        agent: r.author_name ?? "",
        comms: [],
        ...(r.author_id === selfId ? { own: true } : {}),
      } satisfies Appt;
    });
  } catch {
    /* The OS's own appointments failing must not take the REX diary down
       with them — a diary short a travel block still beats no diary. */
    return [];
  }
}

/** The REX book with our own entries merged in, sorted as one day reads. */
/**
 * Feedback written in the OS drawer, laid onto the viewing (15 Sep 2026).
 * Read fresh every time, outside the REX cache, for the same reason as our own
 * appointments: an agent who has just saved a write-up must not see the
 * viewing still sitting in "Feedback due". REX's own record wins where both
 * exist - the drawer never offers the form over one.
 */
async function withOsFeedback(book: DiaryBook): Promise<DiaryBook> {
  const want = book.appts.filter((a) => a.kind === "viewing" && a.day <= 0 && !a.feedback).map((a) => a.id);
  if (!want.length) return book;
  const found = await osFeedbackFor(want).catch(() => new Map());
  if (!found.size) return book;
  return { ...book, appts: book.appts.map((a) => (!a.feedback && found.has(a.id) ? { ...a, feedback: found.get(a.id)! } : a)) };
}

function merged(book: DiaryBook, mine: Appt[]): DiaryBook {
  if (!mine.length) return book;
  const appts = [...book.appts, ...mine].sort(
    (a, b) => a.day - b.day || a.start.localeCompare(b.start)
  );
  return { ...book, appts };
}

/**
 * WHOSE diary is this?
 *
 * It used to be everybody's. This route took no request, asked nothing about
 * who was calling, and handed the whole office's calendar to anyone signed in
 * - so an agent could read every colleague's afternoon, and the Viewings
 * screen offered them an "All agents" picker to do it with. James, 10 Sep
 * 2026: "other agents shouldn't be able to see this. They should only be able
 * to see their own diary."
 *
 * The REX pull stays whole and shared, because it is the slow half and one
 * office-wide fetch every two minutes is the point of the cache. The FILTER
 * happens per request, on the way out.
 *
 * Matching is on the calendar owner's mailbox, never the name - see the note
 * on Appt.agentEmail. An entry we cannot attribute is withheld from a scoped
 * view rather than shown: showing somebody else's appointment is the failure
 * that matters, and an agent noticing a gap will ask.
 */
function forScope(book: DiaryBook, who: { email: string | null; name: string | null; rexEmail?: string | null }): DiaryBook {
  if (!who.email && !who.name) return book;
  const email = who.email?.toLowerCase() ?? null;
  /* The address they sign in to REX with, when it is not the OS one (15 Sep
     2026). A REX calendar is owned by the REX login, and an agent whose REX
     account sits on another address saw an empty diary here. */
  const rexEmail = who.rexEmail?.toLowerCase() ?? null;
  const name = who.name?.trim().toLowerCase() ?? null;
  const appts = book.appts.filter((a) => {
    const owner = (a.agentEmail ?? "").toLowerCase();
    if (rexEmail && owner === rexEmail) return true;
    if (email) return owner === email;
    /* Only reachable when an owner is previewing somebody who has no OS
       account - there is no mailbox to match, so the REX name is all there
       is. Their own deliberate action, on their own screen. */
    return (a.agent ?? "").trim().toLowerCase() === name;
  });
  return { ...book, appts, agents: [...new Set(appts.map((a) => a.agent).filter(Boolean))] };
}

/**
 * Which of the team's entries are the signed-in person's own.
 *
 * James, 21 Sep 2026: "on the dashboard, the diary is showing everybody's
 * things... we should only be able to see our own diaries."
 *
 * An owner is sent the whole team's book, on purpose: the Viewings screen has
 * a person picker and the booker needs everybody's week. But the dashboard's
 * Diary, Today and Viewings tiles read the same book and never narrowed it, so
 * James's "today" was twenty people's. The book stays whole; each entry that
 * is theirs is marked, and the dashboard asks for those (useMyDiary).
 *
 * Marked here rather than matched in the browser because only the server
 * knows the REX login, and a REX calendar is owned by THAT address - the same
 * reason `forScope` reads it. The name is the last resort, as it is there.
 */
function own(book: DiaryBook, self: { email: string | null; name: string | null; rexEmail: string | null }): DiaryBook {
  const name = self.name?.trim().toLowerCase() || null;
  const theirs = (a: Appt) => {
    if (a.own) return true;
    const owner = (a.agentEmail ?? "").toLowerCase();
    if (owner) return owner === self.email || owner === self.rexEmail;
    return Boolean(name) && (a.agent ?? "").trim().toLowerCase() === name;
  };
  return { ...book, appts: book.appts.map((a) => (theirs(a) ? { ...a, own: true } : a)) };
}

/**
 * THEIR OUTLOOK, FOLDED IN (24 Sep 2026) - see lib/outlook-diary.
 *
 * Only ever the signed-in person's own. An owner viewing as somebody gets
 * none: that would be reading another person's Outlook, and James was plain
 * that nobody sees anybody else's diary.
 *
 * A booking made here is in Outlook AND in REX (or our own table), so the
 * Outlook copy of anything the OS made, or anything sitting at exactly the
 * same time and length as one of their own entries, is dropped rather than
 * drawn twice.
 */
function withOutlook(book: DiaryBook, outlook: OutlookRead | null, mineOnly: boolean): DiaryBook {
  if (!outlook?.appts.length) return book;
  /* An agent's book is all theirs; an owner's is the team's, with theirs marked. */
  const theirs = mineOnly ? book.appts : book.appts.filter((a) => a.own);
  const sameAs = (o: Appt) =>
    theirs.some((a) => {
      if (a.day !== o.day) return false;
      const gap = Math.abs(minutesOf(a.start) - minutesOf(o.start));
      return o.fromOs ? gap <= 2 : gap === 0 && a.mins === o.mins;
    });
  const extra = outlook.appts.filter((o) => !sameAs(o));
  if (!extra.length) return book;
  const appts = [...book.appts, ...extra].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  return { ...book, appts };
}
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export async function GET(req: NextRequest) {
  const scope = await scopeFor(req);
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  /* An owner sees the business; everybody else sees their own mailbox. The
     picker on the Viewings screen is drawn from `everything`, so it simply
     does not appear for an agent.

     WHOSE mailbox is the subject's, not the caller's. An owner viewing as
     somebody is asking to see THEIR day; filtering by the owner's own address
     would have shown James an empty diary and called it Rhiannon's. */
  /* Viewing as somebody the OS cannot identify at all - no account and no REX
     record. Falling through would filter by the OWNER's mailbox and present
     the owner's own day as theirs, which is worse than an empty screen. */
  if (viewingAs && !subject) {
    return NextResponse.json({
      ok: true, live: false, mine: [], everything: false,
      reason: "No diary: this person has no account here and no REX record to read one from.",
    });
  }
  const mineOnly = !scope.everything;
  const person = viewingAs && subject ? subject : actor;
  const rexLogin = hasDb()
    ? await q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [person.id]).catch(() => [])
    : [];
  const who = mineOnly
    ? { email: (person.email ?? "").toLowerCase() || null, name: scope.label || null, rexEmail: rexLogin[0]?.rex_email ?? null }
    : { email: null, name: null };

  /* Ours are read OUTSIDE the cache, every time. The two-minute hold exists
     for the slow REX pull; applying it to our own table would mean saving a
     travel buffer and watching the diary insist it isn't there for another
     minute and a half. */
  const mine = await ours(mineOnly ? person.id : null, person.id);
  const self = {
    email: (person.email ?? "").toLowerCase() || null,
    name: person.name || null,
    rexEmail: rexLogin[0]?.rex_email?.toLowerCase() ?? null,
  };
  /* Whose diary "mine" is, and the address it is matched on - so the screen
     can say so instead of "Their own 365 calendar (sign-in TBC)", which was a
     note to ourselves that reached the page (James, 21 Sep 2026). The REX
     login when there is one, because that is the address a calendar is
     actually filed under; otherwise the account's own. */
  const whose = { name: person.name || "", email: self.rexEmail ?? self.email ?? "" };
  /* Their Outlook: asked for now, beside the REX book, and waited on as it is shaped. */
  const outlookP: Promise<OutlookRead | null> = viewingAs
    ? Promise.resolve(null)
    : outlookDiaryFor({ id: actor.id, name: actor.name || "", email: actor.email || "" }).catch(() => ({
        state: "failed" as const,
        appts: [],
        reason: "Your Outlook calendar couldn't be read just now.",
      }));
  const outlookSaid = (o: OutlookRead | null) =>
    o ? { state: o.state, ...(o.reason ? { reason: o.reason } : {}) } : { state: "not_yours" as const };
  /* An agent's book is already only theirs; marking it would say nothing. */
  const shaped = async (book: DiaryBook) => {
    const scoped = merged(forScope(book, who), mine);
    const marked = await withOsFeedback(mineOnly ? scoped : own(scoped, self));
    const outlook = await outlookP;
    /* Both calendars side by side: note whether their REX copies into their
       Outlook, so a booking is not put there twice (lib/rex-outlook-sync). */
    if (outlook?.state === "connected") {
      void noteRexOutlookSync(actor.id, mineOnly ? marked.appts : marked.appts.filter((a) => a.own), outlook.appts);
    }
    return { ...withOutlook(marked, outlook, mineOnly), whose, outlook: outlookSaid(outlook) };
  };

  if (!rexConfigured()) {
    /* No REX here, so the client is showing the sample book. Hand our own
       entries over separately for it to merge on top — they are real, and
       dropping them because the demo diary is standing in would lose work
       somebody actually did. */
    const outlook = await outlookP;
    return NextResponse.json({
      ok: true,
      live: false,
      mine: [...mine, ...(outlook?.appts ?? [])],
      whose,
      outlook: outlookSaid(outlook),
      everything: scope.everything,
      reason: "REX isn't connected here.",
    });
  }

  /* A held book is only good on the day it was read: every appointment in it
     carries `day` as an offset from THAT day, so yesterday's book puts
     yesterday under "Today". Across midnight, or when REX has been down since
     yesterday, it is dropped and the screen gets a read or an honest error. */
  const found = await heldDiary();
  const held = found && londonDayOffset(found.at) === 0 ? found : null;
  const age = held ? Date.now() - held.at : Infinity;
  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, ...(await shaped(held.book)), everything: scope.everything, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refreshDiaryBook();
    return NextResponse.json({ ok: true, live: true, ...(await shaped(held.book)), everything: scope.everything, ageMs: age, stale: true });
  }
  try {
    const fresh = await refreshDiaryBook();
    return NextResponse.json({ ok: true, live: true, ...(await shaped(fresh.book)), everything: scope.everything, ageMs: 0 });
  } catch (e) {
    if (held) {
      return NextResponse.json({ ok: true, live: true, ...(await shaped(held.book)), everything: scope.everything, ageMs: age, stale: true });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." }, { status: 502 });
  }
}
