import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { getAppraisal } from "@/lib/appraisal-store";
import { docusealConfigured, DocusealBlocked, findLandlordSigning } from "@/lib/docuseal";
import { signedFor } from "@/lib/signed-documents";
import { hasDb, q } from "@/lib/db";

/**
 * The landlord signs their terms from their own file.
 *
 * The same DocuSeal session the agent opens from the appraisal, minted for
 * the landlord instead: the template, the prefill and the external id are
 * identical, so the signed PDF comes back through the same webhook, is
 * filed under the same appraisal, and the file moves on to compliance the
 * next time the page loads. Nothing here writes to REX.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { appraisalId?: string };
  const id = (body.appraisalId ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const tpl = Number(process.env.DOCUSEAL_TOB_TEMPLATE_ID ?? 0);
  if (!docusealConfigured() || !tpl) {
    return NextResponse.json(
      { ok: false, error: "Signing isn't switched on here yet. Your agent will send the terms over." },
      { status: 503 }
    );
  }

  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 404 });
  if (ma.valuation == null) {
    return NextResponse.json({ ok: false, error: "Your terms follow the valuation. They aren't ready yet." }, { status: 409 });
  }

  try {
    /* FINDS, NEVER MINTS. This used to open a contract of its own, which meant
       a landlord pressing sign in their portal created a SECOND submission
       against the same appraisal - two live contracts for one property and
       nothing saying which counted. The agent signs first and their send is
       what brings this into existence; see openTermsSigning. */
    const session = await findLandlordSigning(ma.id);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Your terms aren't ready to sign yet. Your agent is preparing them." },
        { status: 409 }
      );
    }
    /* Counted for the agent's file: the eye on the contract line
       (James, 17 Sep 2026: "a little eye icon with the amount of times it's
       been seen"). Every open of their contract from their own file. */
    if (hasDb()) {
      await q(
        `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
         VALUES ('landlord-contract-views', $1, $2::jsonb, NOW(), $3)
         ON CONFLICT (kind, record_id) DO UPDATE
           SET payload = jsonb_build_object('count', COALESCE((os_case_state.payload->>'count')::int, 0) + 1, 'lastAt', $4::text),
               updated_at = NOW()`,
        [ma.id, JSON.stringify({ count: 1, lastAt: new Date().toISOString() }), me.email, new Date().toISOString()]
      ).catch(() => null);
    }
    return NextResponse.json({ ok: true, url: session.embedSrc });
  } catch (e) {
    const msg = e instanceof DocusealBlocked ? e.message : e instanceof Error ? e.message : "Couldn't open the terms.";
    console.error("[landlord/sign] failed", msg);
    return NextResponse.json({ ok: false, error: "Couldn't open the terms just now. Try again in a moment, or ask your agent." }, { status: 502 });
  }
}

/** GET ?appraisalId= - has the signed copy reached us yet? SignedNext waits on it. */
export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("appraisalId") ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }
  const rows = await signedFor(id);
  return NextResponse.json({ ok: true, signed: rows.some((r) => r.completed_at) });
}
