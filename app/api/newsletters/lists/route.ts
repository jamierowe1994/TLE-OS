import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { MAIL_LISTS, isListId, peopleOn, resolveLists } from "@/lib/mail-lists";
import { DAILY_RAMP, daysToSend, getMailSender, mailoutPace } from "@/lib/mail-sender";
import { mailoutDomains } from "@/lib/resend";
import { switchOn } from "@/lib/switches";

/**
 * The landlord and tenant mailing lists as they stand now (lib/mail-lists),
 * for Who Gets It on a mail-out: how many are on each, how many could not be
 * placed in a country, the address mail-outs come from and today's pace.
 *
 *   ?picked=a,b   also the number of people on those lists together, each
 *                 person once, and how many days that takes to send
 *   ?people=a     the people on one list, to look down before sending
 *
 * Live or nothing: if the Portfolio book cannot be read this says so, and the
 * screen shows that rather than an old figure.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    const all = await resolveLists();
    const people = req.nextUrl.searchParams.get("people");
    if (people) {
      if (!isListId(people)) return NextResponse.json({ ok: false, error: "No such list." }, { status: 400 });
      return NextResponse.json({ ok: true, people: all.lists[people].slice(0, 2000), total: all.lists[people].length });
    }
    const picked = (req.nextUrl.searchParams.get("picked") ?? "").split(",").filter(isListId);
    const [sender, pace, customerEmail, mailouts] = await Promise.all([getMailSender(), mailoutPace(), switchOn("customer_email"), switchOn("marketing_mailouts")]);
    const pickedTotal = picked.length ? (await peopleOn(picked)).length : 0;
    return NextResponse.json({
      ok: true,
      at: new Date(all.at).toISOString(),
      lists: MAIL_LISTS.map((l) => ({ ...l, count: all.lists[l.id].length })),
      unplaced: all.unplaced,
      optedOut: all.optedOut,
      pickedTotal,
      days: pickedTotal ? daysToSend(pickedTotal, pace) : 0,
      sender,
      domains: mailoutDomains(),
      pace: { ...pace, ramp: DAILY_RAMP },
      armed: { customerEmail, mailouts },
    });
  } catch (e) {
    console.error("[newsletters/lists]", e);
    return NextResponse.json({ ok: false, error: "The lists could not be read just now. Try again in a minute." }, { status: 503 });
  }
}
