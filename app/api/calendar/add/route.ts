import { NextRequest, NextResponse } from "next/server";
import { readCalendarLink } from "@/lib/calendar-links";
import { icsFile } from "@/lib/outlook-calendar";

/**
 * GET ?e&s → the appointment as a calendar file (lib/calendar-links).
 *
 * The Add to my calendar button in a confirmation. Public, because the
 * landlord or applicant pressing it is not signed in; signed, so the only
 * appointments it will hand out are ones we put in an email.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ev = readCalendarLink(req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"));
  if (!ev) return new NextResponse("That calendar link isn't valid.", { status: 404 });
  const ics = icsFile({ uid: ev.uid, summary: ev.title, description: ev.details, location: ev.location, startsAt: ev.startsAt, minutes: ev.minutes });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="appointment.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
