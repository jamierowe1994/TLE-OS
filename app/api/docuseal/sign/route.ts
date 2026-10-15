import { NextRequest, NextResponse } from "next/server";
import { directListingLandlordAddress } from "@/lib/contract-send";
import { findHomeAddress } from "@/lib/landlord-home";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal, markTermsSent } from "@/lib/appraisal-store";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import { docusealConfigured, openTermsSigning, feeWording, DocusealBlocked, archiveTermsFor } from "@/lib/docuseal";
import { signedFor } from "@/lib/signed-documents";
import { isTestFile } from "@/lib/test-guard";
import { testSignSrc } from "@/lib/test-terms";

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

  /* replace: Change on Prepare and send (James, 17 Sep 2026) - a typo in the
     landlord's address, a wrong box - draws the contract up again and
     archives the one it replaces, so there is only ever one live contract. */
  const body = (await req.json().catch(() => ({}))) as { id?: string; replace?: boolean };
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which appraisal?" }, { status: 400 });

  /* A TEST FILE NEVER OPENS A DOCUSEAL CONTRACT (James, 13 Oct 2026). Asked
     before DocuSeal is even looked for, so a tester is never stopped by its
     connection: the answer is the stand-in signing sheet (lib/test-terms), in
     the shape the screens open any contract in. Signing it files the test
     row, and the file reads as signed by both sides. */
  const test = await isTestFile({ appraisalId: id }).catch(() => false);

  if (!test && !docusealConfigured()) {
    return NextResponse.json(
      { error: "DocuSeal isn't connected here. DOCUSEAL_URL and DOCUSEAL_API_KEY are both needed." },
      { status: 503 }
    );
  }
  const tpl = templateId();
  if (!test && !tpl) {
    return NextResponse.json(
      { error: "No terms template is configured — set DOCUSEAL_TOB_TEMPLATE_ID." },
      { status: 503 }
    );
  }

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

  if (body.replace && (await signedFor(ma.id)).some((r) => r.completed_at)) {
    return NextResponse.json(
      { error: `${ma.landlord} has already signed it, so it can't be changed here.` },
      { status: 409 }
    );
  }

  if (test) {
    return NextResponse.json({
      ok: true,
      embedSrc: testSignSrc(ma.id),
      slug: "test",
      landlordSlug: null,
      submissionId: null,
      serviceLevel: service?.label ?? null,
      valuation: ma.valuation,
      test: true,
    });
  }

  /* THE LANDLORD'S OWN ADDRESS (Richard Callow, 15 Oct 2026: "Wont allow me
     to send lettings terms of business without adding landlord home address").
     The template makes the box required, so a blank one stopped the agent
     inside the signing form with nothing to copy from. Now it comes from the
     landlord's record (lib/landlord-home) - saved, or what PayProp or REX
     already hold - and Prepare and send asks for it, with "Same as the let
     property", before this is pressed. A contract is not drawn up without
     one: it is a contract, and it needs an address for the landlord. */
  const home = await findHomeAddress({
    email,
    ref: ma.landlordRef ?? null,
    name: ma.landlord,
    propertyAddress: [ma.address, ma.postcode].filter(Boolean).join(", "),
  }).catch(() => null);
  const landlordAddress = (home?.saved ? home.address : null) ?? (await directListingLandlordAddress(ma.id).catch(() => null)) ?? home?.address ?? "";
  if (!landlordAddress.trim()) {
    return NextResponse.json(
      { error: `Add ${ma.landlord}'s home address first. The terms are a contract, so they need the address the landlord lives at.`, needsHomeAddress: true },
      { status: 409 }
    );
  }

  try {
    const fees = feeWording(service?.label ?? ma.serviceLevel, ma.feePct ?? null, ma.setupFee ?? null);
    const session = await openTermsSigning(tpl, {
      agentName: ma.agent ?? me.name ?? "",
      /* The agent signs first, so they need an address of their own. Theirs if
         the appraisal names somebody we know, otherwise whoever is pressing
         the button - which is the agent, standing in front of the landlord. */
      agentEmail: me.email,
      landlordName: ma.landlord,
      landlordEmail: email,
      /* Their own address, never the let's unless the agent said they live
         there ("Same as the let property") - see above. */
      landlordAddress,
      contactNumber: (ma.landlordMobile ?? "").trim(),
      propertyAddress: [ma.address, ma.postcode].filter(Boolean).join(", "),
      serviceLevel: service?.label ?? "",
      setUpFee: fees.setUp,
      managementFee: fees.management,
      /* Said, not left blank. An empty box on a signed contract is an argument
         waiting to happen. */
      additionalFees: "None",
      externalId: ma.id,
    });

    /* The spine's "Terms sent" tick reads this. */
    await markTermsSent(ma.id);
    if (body.replace) await archiveTermsFor(ma.id, session.submissionId).catch(() => 0);

    return NextResponse.json({
      ok: true,
      /* The AGENT's session is the one that opens now. The landlord's is minted
         at the same moment and waits for them; their portal finds it rather
         than starting a second contract. */
      ...session.agent,
      landlordSlug: session.landlord.slug,
      submissionId: session.submissionId,
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
      { error: publicError(e, "Couldn't open the terms.") },
      { status: 502 }
    );
  }
}
