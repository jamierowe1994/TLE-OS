import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { overview, pages, section } from "@/lib/tracking/report";
import { SECTION_BY_KEY, type SectionKey } from "@/lib/tracking/sections";

/**
 * Admin > Tracking (15 Oct 2026, lib/tracking/report). Owners only.
 *
 *   GET ?from=&to=                    the highlights, every part of the OS, every person
 *   GET ?from=&to=&section=<key>      one part: by person, by day, the records behind each figure
 *   GET ?from=&to=&section=pages      every page: views, people, time on it
 *
 *   &owners=1     count the owners' own use too
 *   &person=<key> only this person
 *
 * `from` and `to` are worked out by the screen from the clock (lib/tracking/
 * period); `to` is exclusive and never later than now.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get("from") ?? "");
  let to = new Date(sp.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ ok: false, error: "Pick a period to look at." }, { status: 400 });
  }
  if ((to.getTime() - from.getTime()) / 86400000 > MAX_DAYS) {
    return NextResponse.json({ ok: false, error: "That's longer than a year - pick a shorter period." }, { status: 400 });
  }
  /* A period that runs to now ends at the next whole minute, so the same
     question asked twice in a minute is the same question (report.ts holds
     the answer for a minute). */
  const now = Date.now();
  if (to.getTime() > now - 60_000) to = new Date(Math.ceil(now / 60_000) * 60_000);

  const opts = { from, to, owners: sp.get("owners") === "1", person: sp.get("person") || null };
  const key = sp.get("section");
  try {
    if (!key) return NextResponse.json({ ok: true, ...(await overview(opts)) });
    if (key === "pages") return NextResponse.json({ ok: true, ...(await pages(opts)) });
    if (!SECTION_BY_KEY.has(key as SectionKey)) return NextResponse.json({ ok: false, error: "There's no such part of the OS." }, { status: 404 });
    return NextResponse.json({ ok: true, ...(await section(key as SectionKey, opts)) });
  } catch (e) {
    console.error("[tracking]", e);
    return NextResponse.json({ ok: false, error: "The figures couldn't be read just now." }, { status: 500 });
  }
}
