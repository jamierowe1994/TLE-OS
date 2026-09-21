import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { msAccessTokenFor, msConnectionFor } from "@/lib/microsoft";
import {
  findFooterInMailbox, footerFor, footerPreviewHtml, removeFooter, saveFooterImage, type EmailFooter,
} from "@/lib/email-footer";

/**
 * A person's own email footer (lib/email-footer).
 *
 *   GET     what is held, ready to show
 *   POST    { find: true }            look in their mailbox for the blank email
 *           { image: <data URL> }     or take one picture of it instead
 *   DELETE  take it off
 *
 * Always the ACTOR's, and refused while viewing as somebody: finding a footer
 * reads a mailbox, and an owner looking at an agent's screens has not been
 * given that agent's email - the same line lib/mailbox-read draws.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const shape = (f: EmailFooter | null) =>
  f ? { html: footerPreviewHtml(f), source: f.source, updatedAt: f.updatedAt, pictures: f.images.length } : null;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const conn = await msConnectionFor(actor.id);
  return NextResponse.json({ ok: true, footer: shape(await footerFor(actor.id)), mailbox: conn.connected ? conn.email : null });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first. A footer is set by the person it belongs to." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { find?: boolean; image?: string };

  if (typeof b.image === "string") {
    const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.image);
    const saved = m ? await saveFooterImage(actor.id, m[1], m[2]) : null;
    if (!saved) return NextResponse.json({ ok: false, error: "That needs to be a PNG or JPG picture under 600KB." }, { status: 400 });
    return NextResponse.json({ ok: true, footer: shape(saved) });
  }

  if (b.find) {
    const conn = await msConnectionFor(actor.id);
    if (!conn.connected) {
      return NextResponse.json({ ok: false, error: "Connect your Microsoft mailbox above first." }, { status: 400 });
    }
    let token: string;
    try {
      token = await msAccessTokenFor(actor.id);
    } catch {
      return NextResponse.json({ ok: false, error: "Your mailbox needs connecting again before we can look." }, { status: 400 });
    }
    const found = await findFooterInMailbox(actor.id, conn.email ?? actor.email, token);
    if (!found.ok) return NextResponse.json({ ok: false, reason: found.reason, error: found.detail }, { status: found.reason === "refused" ? 502 : 404 });
    return NextResponse.json({ ok: true, footer: shape(found.footer) });
  }

  return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first." }, { status: 403 });
  await removeFooter(actor.id);
  return NextResponse.json({ ok: true });
}
