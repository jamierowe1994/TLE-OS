import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getNewsletter, renderNewsletter } from "@/lib/newsletters";
import { checkLinks, linksIn, newsletterResults } from "@/lib/newsletter-track";

/**
 * How a sent email did (1 Oct 2026, Francesca): opens, clicks, each link,
 * delivered and bounced, person by person.
 *
 *   GET                        -> the figures
 *   POST { action: "check" }   -> does every link in the email open?
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  const id = (await params).id;
  const n = await getNewsletter(id);
  if (!n) return NextResponse.json({ ok: false, error: "That email no longer exists." }, { status: 404 });
  const results = await newsletterResults(id);
  /* Every link in the email, clicked or not, so a link nobody clicked still shows. */
  const inEmail = linksIn(renderNewsletter(n, { email: "someone@thelettingexperts.co.uk", name: "" }).html);
  return NextResponse.json({ ok: true, results, linksInEmail: inEmail });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  const n = await getNewsletter((await params).id);
  if (!n) return NextResponse.json({ ok: false, error: "That email no longer exists." }, { status: 404 });
  const urls = linksIn(renderNewsletter(n, { email: "someone@thelettingexperts.co.uk", name: "" }).html);
  return NextResponse.json({ ok: true, checks: await checkLinks(urls) });
}
