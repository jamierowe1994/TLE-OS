import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { presentationsFor } from "@/lib/present-store";
import { hasDb, q } from "@/lib/db";
import { mintRecordLink } from "@/lib/record-link";
import { firstNameOf } from "@/lib/present";
import { publicOrigin } from "@/lib/origin";

/**
 * What the recording page needs, and a code to carry on by phone.
 *
 * GET  ?id=…  → the appraisal in a line, its pre-appraisal deck if one has
 *               been minted, the video on it, and when the deck goes out
 * POST { id } → a fresh single-use link into this same page, as a QR code,
 *               for the agent who opened the email on a laptop and would
 *               rather record on their phone
 *
 * The deck itself is minted by the page through /api/presentations, the same
 * call the appraisal track makes, so a recorder-minted deck is the deck.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const origin = publicOrigin;

async function who(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? findUserById(userId) : null;
}

/** The landlord's pre-appraisal email: when it goes if queued, or when it went.
 *  No longer guessed as "the day before" - it goes within two hours of booking
 *  or when the agent sends it (lib/pre-send-time, 1 Oct 2026). */
async function goesOut(refs: string[]): Promise<{ goesOut: string | null; sentAt: string | null }> {
  if (!hasDb() || !refs.length) return { goesOut: null, sentAt: null };
  const rows = await q<{ state: string; send_at: string; sent_at: string | null }>(
    `SELECT state, send_at, sent_at FROM os_scheduled_sends
      WHERE ref = ANY($1) AND kind = 'pre-appraisal' AND state IN ('queued','sending','sent')
      ORDER BY (state = 'sent') DESC, send_at LIMIT 1`,
    [refs]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return { goesOut: null, sentAt: null };
  return r.state === "sent"
    ? { goesOut: null, sentAt: new Date(r.sent_at ?? r.send_at).toISOString() }
    : { goesOut: new Date(r.send_at).toISOString(), sentAt: null };
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which appraisal?" }, { status: 400 });
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const ref = ma.leadId ?? ma.id;
  const decks = await presentationsFor(ref).catch(() => []);
  const pre = decks.find((d) => d.kind === "pre-appraisal") ?? null;

  return NextResponse.json({
    ok: true,
    appraisal: {
      id: ma.id,
      ref,
      address: ma.address,
      postcode: ma.postcode,
      landlord: ma.landlord,
      landlordFirst: firstNameOf(ma.landlord),
      appointmentAt: ma.appointmentAt,
    },
    deck: pre ? { token: pre.token, url: `${origin(req)}/present/${pre.token}` } : null,
    video: pre?.deck.welcomeVideo ?? null,
    ...(await goesOut([...new Set([ref, ma.id])])),
    me: { name: me.name, email: me.email },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which appraisal?" }, { status: 400 });
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const url = await mintRecordLink({ email: me.email, appraisalId: ma.id, origin: origin(req) });
  /* Error correction M and a real display size, for the same reason as the
     recorder's own code in /api/video: the URL is long, and a code that is
     too dense for a phone camera is a picture, not a link. */
  const qrSvg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }).catch(
    () => null
  );
  return NextResponse.json({ ok: true, url, qrSvg });
}
