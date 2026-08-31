import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import { docusealConfigured, openTermsSigning, DocusealBlocked } from "@/lib/docuseal";

/**
 * Open a signing session for one appraisal's terms of business.
 *
 * POST { id } → { embedSrc, slug } for the embedded form.
 *
 * ── Why this needs no send switch ─────────────────────────────────────────
 *
 * DOCUSEAL_ALLOW_SEND gates EMAILING a landlord. This does not email anybody:
 * `send_email` is false, and the landlord signs on our screen with the agent
 * beside them. The thing the switch protects against — a contract arriving in
 * a client's inbox because a request reached a file — cannot happen here.
 *
 * What it does need is a signed-in agent and a real appraisal, because the
 * contract states an agreed rent and a fee and somebody has to be accountable
 * for those numbers.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The template to sign against. Configuration, not a constant: England and
 *  Scotland are different documents and there will be more. */
function templateId(): number {
  return Number(process.env.DOCUSEAL_TOB_TEMPLATE_ID ?? 0);
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { error: "Sign in first — the terms go out with an agent's name on them." },
      { status: 401 }
    );
  }

  if (!docusealConfigured()) {
    return NextResponse.json(
      { error: "DocuSeal isn't connected here. DOCUSEAL_URL and DOCUSEAL_API_KEY are both needed." },
      { status: 503 }
    );
  }
  const tpl = templateId();
  if (!tpl) {
    return NextResponse.json(
      { error: "No terms template is configured — set DOCUSEAL_TOB_TEMPLATE_ID." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which appraisal?" }, { status: 400 });

  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ error: "No such appraisal." }, { status: 404 });

  /* THE FIGURE IS THE POINT. Terms with no rent on them are not terms, and a
     landlord asked to sign a blank fee is being asked to sign a blank cheque. */
  if (ma.valuation == null) {
    return NextResponse.json(
      { error: "Record the valuation first — the terms state the rent and the fee." },
      { status: 409 }
    );
  }

  /* An address to send it to. DocuSeal needs one even when nothing is emailed,
     and a contract addressed to nobody is not one we should be minting. */
  const email = (ma.landlordEmail ?? "").trim();
  if (!email) {
    return NextResponse.json(
      { error: `No email address on ${ma.landlord}. Add one to the contact before sending terms.` },
      { status: 409 }
    );
  }

  const service = SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel);

  try {
    const session = await openTermsSigning(tpl, {
      agentName: ma.agent ?? me.name ?? "",
      landlordName: ma.landlord,
      landlordEmail: email,
      /* The landlord's own address is not held separately from the property's
         today. Sending the property address for both is wrong on a contract,
         so the landlord address is left BLANK rather than guessed — an empty
         box an agent can fill beats a confident wrong one. */
      landlordAddress: "",
      contactNumber: (ma.landlordMobile ?? "").trim(),
      propertyAddress: [ma.address, ma.postcode].filter(Boolean).join(", "),
      feeAmount: ma.setupFee ?? null,
      feePercent: ma.feePct ?? null,
      externalId: ma.id,
    });

    return NextResponse.json({
      ok: true,
      ...session,
      /* Said back so the panel can show what the landlord is about to see
         without re-deriving it. */
      serviceLevel: service?.label ?? null,
      valuation: ma.valuation,
    });
  } catch (e) {
    if (e instanceof DocusealBlocked) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't open the terms." },
      { status: 502 }
    );
  }
}
