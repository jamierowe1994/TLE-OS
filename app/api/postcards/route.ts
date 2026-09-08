import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { readDesigns, writeDesigns, sendable } from "@/lib/postcard-store";
import { faultsIn, normalise, type PostcardDesign } from "@/lib/postcard-design";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { emailShell } from "@/lib/email/shell";

/**
 * The postcard designs, and sending one to somebody to look at.
 *
 * GET  → the designs and their proof links.
 * PUT  → save the designs, refusing any that would print off the card.
 * POST → email a proof link. Internal shell, internal sender: the people who
 *        get shown a proof are Susan and the team, not customers.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const held = await readDesigns();
  return NextResponse.json({ ok: true, ...held, origin: ORIGIN });
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { designs?: PostcardDesign[] } | null;
  if (!Array.isArray(body?.designs)) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  /* Checked again here: the form checks as you type, but a form is not a
     guard, and a card that overflows costs paper rather than a refresh. */
  const designs = body.designs.map(normalise).filter((d): d is PostcardDesign => d !== null);
  const bad = designs.flatMap((d) => faultsIn(d).map((f) => `${d.name}: ${f.says}`));
  if (bad.length) return NextResponse.json({ ok: false, error: bad[0] }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await writeDesigns(designs)) });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = subject ?? actor;
  const body = (await req.json().catch(() => null)) as { designId?: string; to?: string; note?: string } | null;
  const to = (body?.to ?? "").trim();
  if (!to.includes("@")) return NextResponse.json({ ok: false, error: "Who is it going to?" }, { status: 400 });

  const { designs, tokens } = await readDesigns();
  const design = designs.find((d) => d.id === body?.designId);
  if (!design) return NextResponse.json({ ok: false, error: "No such design." }, { status: 404 });
  if (!sendable(design)) return NextResponse.json({ ok: false, error: "That card does not fit yet. Fix it before showing anybody." }, { status: 400 });

  const link = `${ORIGIN}/proof/${tokens[design.id]}`;
  try {
    await sendEmail({
      to,
      subject: `A postcard to look at: ${design.name}`,
      html: emailShell({
        heading: "Have a look at this card",
        intro: `${me.name || "Somebody"} would like your eye on a postcard before it goes anywhere.${body?.note ? ` "${body.note}"` : ""}`,
        rows: [{
          title: design.name,
          /* The headline is whatever the biggest words on the front are now,
             rather than a field, since the card is layers. */
          detail: design.layers
            .filter((l) => l.side === "front" && l.kind === "text")
            .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
            .slice(0, 2)
            .map((l) => l.text)
            .join(" "),
          tone: "neutral",
        }],
        rowsLead: "The design",
        button: "Open the proof",
        link,
        image: "illustrations/email/certificates.gif",
        footnote: "Both sides, at the size it prints. Nothing has been posted and nothing will be until somebody says so.",
      }),
      text: `${me.name} would like your eye on a postcard: ${design.name}. ${link}`,
    });
    return NextResponse.json({ ok: true, link });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "The email did not send." },
      { status: 400 }
    );
  }
}
