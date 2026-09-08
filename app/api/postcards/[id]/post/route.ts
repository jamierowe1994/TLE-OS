import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { readDesigns, sendable } from "@/lib/postcard-store";
import { postcardSidePdf } from "@/lib/postcard-pdf";
import { sendPostcard, stannpBalance, stannpConfigured, stannpTestMode, type StannpRecipient } from "@/lib/stannp";

/**
 * Print and post one card to named people.
 *
 * This one spends money and puts paper through a letterbox, so:
 *
 *   • an owner only;
 *   • a live send needs BOTH `live: true` in the body and STANNP_TEST_MODE
 *     set to false on the environment, so turning it on is two acts;
 *   • the card must pass its own checks first;
 *   • every send is tagged, so it can be found in Stannp's reporting.
 *
 * GET reports what a send would do without doing it: whether the key is
 * there, whether the environment is in test, and what the balance is.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const balance = await stannpBalance();
  return NextResponse.json({
    ok: true,
    configured: stannpConfigured(),
    testMode: stannpTestMode(),
    balance: balance.ok ? balance.balance : null,
    balanceError: balance.ok ? null : balance.error,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:business")) {
    return NextResponse.json({ ok: false, error: "Posting cards costs money, so it is an owner's to do." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { recipients?: StannpRecipient[]; live?: boolean; note?: string } | null;
  const recipients = body?.recipients ?? [];
  if (!recipients.length) return NextResponse.json({ ok: false, error: "Who is it going to?" }, { status: 400 });
  for (const r of recipients) {
    if (!r.firstname?.trim() || !r.lastname?.trim() || !r.address1?.trim() || !r.postcode?.trim()) {
      return NextResponse.json({ ok: false, error: "Each person needs a first name, a surname, a first line and a postcode." }, { status: 400 });
    }
  }

  const { designs } = await readDesigns();
  const design = designs.find((d) => d.id === id);
  if (!design) return NextResponse.json({ ok: false, error: "No such design." }, { status: 404 });
  if (!sendable(design)) return NextResponse.json({ ok: false, error: "That card has a fault on it. Fix it before posting." }, { status: 400 });

  const results = [];
  for (const r of recipients) {
    /* Rendered per person: the merge happens here, in our own type, because
       Stannp cannot merge into artwork we supply as a file. */
    const values: Record<string, string> = {
      firstname: r.firstname, lastname: r.lastname,
      property: r.address1, address1: r.address1, city: r.city ?? "", postcode: r.postcode,
      agent: actor.name || "The Letting Experts",
      phone: "0117 496 0142",
      anniversary: "",
    };
    const [front, back] = await Promise.all([
      postcardSidePdf(design, "front", { values, forStannp: true }),
      postcardSidePdf(design, "back", { values, forStannp: true }),
    ]);
    const out = await sendPostcard({ recipient: r, front, back, live: body?.live, tags: `tle-os,${design.id}` });
    results.push({ to: `${r.firstname} ${r.lastname}`, ...out });
  }

  return NextResponse.json({ ok: results.every((x) => x.ok), testMode: stannpTestMode(), results });
}
