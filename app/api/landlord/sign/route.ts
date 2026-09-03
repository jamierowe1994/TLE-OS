import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { getAppraisal } from "@/lib/appraisal-store";
import { docusealConfigured, DocusealBlocked, openTermsSigning } from "@/lib/docuseal";

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
    const session = await openTermsSigning(tpl, {
      agentName: ma.agent ?? "",
      landlordName: ma.landlord,
      landlordEmail: me.email,
      landlordAddress: "",
      contactNumber: (ma.landlordMobile ?? "").trim(),
      propertyAddress: [ma.address, ma.postcode].filter(Boolean).join(", "),
      feeAmount: ma.setupFee ?? null,
      feePercent: ma.feePct ?? null,
      externalId: ma.id,
    });
    return NextResponse.json({ ok: true, url: session.embedSrc });
  } catch (e) {
    const msg = e instanceof DocusealBlocked ? e.message : e instanceof Error ? e.message : "Couldn't open the terms.";
    console.error("[landlord/sign] failed", msg);
    return NextResponse.json({ ok: false, error: "Couldn't open the terms just now. Try again in a moment, or ask your agent." }, { status: 502 });
  }
}
