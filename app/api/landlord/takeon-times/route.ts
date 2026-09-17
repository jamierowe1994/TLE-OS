import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordJourneys, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { getAppraisal } from "@/lib/appraisal-store";
import { saveTakeOnTimes, takeOnTimes, type TakeOnTimes } from "@/lib/takeon";
import { recipientFor } from "@/lib/agent-recipient";
import { sendEmail } from "@/lib/resend";
import { skyListShell } from "@/lib/email/shell-sky";
import { publicOrigin } from "@/lib/origin";

/**
 * "These are the times I can do for the photographs" (James, 17 Sep 2026).
 * Optional - a re-let often keeps the photographs it has - and it reaches the
 * agent by email with a button into the appraisal, where they book it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PARTS = ["morning", "afternoon", "either"] as const;
const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const partWords = (p: string) => (p === "morning" ? "morning" : p === "afternoon" ? "afternoon" : "any time");

export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("appraisalId") ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  return NextResponse.json({ ok: true, times: await takeOnTimes(id) });
}

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { appraisalId?: string; slots?: Array<{ day?: string; part?: string }>; note?: string };
  const journeys = await landlordJourneys(me);
  const id = (body.appraisalId ?? "").trim() || journeys[0]?.appraisal.id || "";
  if (!id || !(await landlordOwnsAppraisal(me, id))) return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });

  const slots = (body.slots ?? [])
    .map((s) => ({ day: (s.day ?? "").slice(0, 10), part: (PARTS.find((p) => p === s.part) ?? "either") as TakeOnTimes["slots"][number]["part"] }))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.day))
    .slice(0, 5);
  if (!slots.length) return NextResponse.json({ ok: false, error: "Pick at least one day." }, { status: 400 });

  const times: TakeOnTimes = { slots, note: (body.note ?? "").trim().slice(0, 500), at: new Date().toISOString() };
  await saveTakeOnTimes(id, times, me.email);

  const ma = await getAppraisal(id);
  const to = ma ? await recipientFor(ma.agent, { email: "", name: "" }) : null;
  let emailed = false;
  if (ma && to?.email) {
    const lines = slots.map((s) => `${dayWords(s.day)}, ${partWords(s.part)}`);
    try {
      await sendEmail({
        to: to.email,
        subject: `${ma.landlord} can do these times for the photographs`,
        html: skyListShell({
          heading: "Times for the Photographs",
          intro: `${ma.landlord} has said when they can do the take-on visit at ${ma.address.split(",")[0].trim() || ma.address}:`,
          rows: lines.map((l) => ({ title: l })),
          rowStyle: "bare",
          rowMarkers: false,
          button: "Book the visit",
          link: `${publicOrigin(req)}/market-appraisals/${encodeURIComponent(ma.id)}?takeon=1`,
          tip: times.note ? `They added: ${times.note}` : undefined,
          tipQuiet: true,
        }),
        text: `${ma.landlord} can do:\n${lines.join("\n")}\n${times.note ? `\nThey added: ${times.note}\n` : ""}\nBook it: ${publicOrigin(req)}/market-appraisals/${ma.id}?takeon=1`,
        replyTo: me.email,
      });
      emailed = true;
    } catch {
      /* Saved either way: the agent sees it on the file. */
    }
  }
  return NextResponse.json({ ok: true, times, emailed });
}
