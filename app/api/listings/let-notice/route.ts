import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { record } from "@/lib/audit";
import { listingIsTheirs } from "@/lib/listing-gate";
import { LET_NOTICE_CAP, letNoticeCandidates, letNoticeEmail, letNoticesTold, sendLetNotices } from "@/lib/let-notice";
import { switchOn } from "@/lib/switches";
import { publicError } from "@/lib/public-error";

/**
 * "It's been let" to the other enquirers and viewers (lib/let-notice), from
 * Take It Offline and Notify Enquiries.
 *
 *   GET  ?listing=<id>&property=<id>                        who would be told
 *   GET  ...&address=<home>&preview=1                       also who was told already, whether
 *                                                           customer email is on, and the email
 *                                                           as the first of them will get it
 *   POST { listingId, propertyId, address, emails: [...] }  tell those (the server re-checks every one)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest, listingId: string) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return { error: "Sign in first.", status: 401 } as const;
  if (actor.role !== "agent" && !can(actor.role, "staff:internal")) return { error: "This is for the listing's agent.", status: 403 } as const;
  if (!/^\d+$/.test(listingId)) return { error: "Which listing?", status: 400 } as const;
  const notTheirs = await listingIsTheirs(actor, Number(listingId)).catch(() => "That listing could not be read just now. Try again in a minute.");
  if (notTheirs) return { error: notTheirs, status: 403 } as const;
  return { actor, viewingAs } as const;
}

export async function GET(req: NextRequest) {
  const listingId = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  const propertyId = (req.nextUrl.searchParams.get("property") ?? "").trim() || null;
  const g = await gate(req, listingId);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  try {
    const people = await letNoticeCandidates(listingId, propertyId);
    if (req.nextUrl.searchParams.get("preview") !== "1") return NextResponse.json({ ok: true, people, cap: LET_NOTICE_CAP });
    const address = (req.nextUrl.searchParams.get("address") ?? "").trim().slice(0, 200) || "this home";
    const [told, emailsOn, email] = await Promise.all([
      letNoticesTold(listingId),
      switchOn("customer_email").catch(() => false),
      letNoticeEmail({ me: g.actor, listingId, address, person: people[0] ?? { email: "sample@example.com", name: "there" } }).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, people, cap: LET_NOTICE_CAP, told, emailsOn, email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't read who enquired.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { listingId?: unknown; propertyId?: unknown; address?: unknown; emails?: unknown };
  const listingId = typeof b.listingId === "string" || typeof b.listingId === "number" ? String(b.listingId) : "";
  const g = await gate(req, listingId);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  if (g.viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them first." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be sent on this environment." }, { status: 503 });
  const emails = Array.isArray(b.emails) ? b.emails.filter((e): e is string => typeof e === "string").slice(0, LET_NOTICE_CAP) : [];
  const address = typeof b.address === "string" ? b.address.trim().slice(0, 200) : "";
  if (!emails.length) return NextResponse.json({ ok: false, error: "Nobody picked." }, { status: 400 });
  if (!address) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const out = await sendLetNotices({ me: g.actor, listingId, propertyId: typeof b.propertyId === "string" && b.propertyId ? b.propertyId : null, address, emails });
    await record({ kind: "listing_publication", actorId: g.actor.id, actorEmail: g.actor.email, detail: `${listingId}: told ${out.sent} enquirer(s) and viewer(s) it's been let` }).catch(() => {});
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't send.") }, { status: 502 });
  }
}
