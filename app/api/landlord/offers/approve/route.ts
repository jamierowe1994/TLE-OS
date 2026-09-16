import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";
import { currentApproval, markApprovalEmailed, recordApproval } from "@/lib/landlord-offers";
import { sendEmail } from "@/lib/resend";
import { hasDb } from "@/lib/db";

/**
 * "I am happy with this one."
 *
 * Recorded here and emailed to the agent, and that is the whole of it: REX and
 * Propoly are read-only from the OS, so this cannot and does not accept the
 * application. The agent confirms it with the tenant. The screen says so in
 * those words, and so does the email, because the failure mode worth designing
 * against is a landlord who believes a tenancy is agreed and stops picking up.
 *
 * The offer is re-read from the landlord's OWN view rather than trusted from
 * the request. The body carries an application id and nothing else that
 * matters: the amount and the names written onto the record come from the
 * offer as the server sees it, so a tampered request cannot file an approval
 * for a property that is not theirs, nor for an amount nobody offered.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OFFICE = "hello@thelettingexperts.co.uk";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, approval: await currentApproval(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { offerId?: string; appraisalId?: string; p?: string };
  const offerId = (body.offerId ?? "").trim();
  if (!offerId) return NextResponse.json({ ok: false, error: "No offer was named." }, { status: 400 });

  const appraisalId = (body.appraisalId ?? "").trim() || null;
  if (appraisalId && !(await landlordOwnsAppraisal(me, appraisalId))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  /* THEIR OWN VIEW, not the request's word for it. `p` is the property they
     were looking at, so a landlord with two properties approves against the
     right one. */
  const { view } = await loadLandlordHome(me, body.p ?? null);
  const offer = view?.offers?.find((o) => o.id === offerId);
  if (!offer) {
    return NextResponse.json({ ok: false, error: "That offer isn't on your property." }, { status: 404 });
  }

  const property = view?.property?.address ?? "your property";
  const approval = await recordApproval({
    accountId: me.id,
    appraisalId,
    applicationId: offer.id,
    amount: offer.amount,
    applicants: offer.applicants,
    property,
  });

  /* Told, not done. The agent is the one who can actually move it. */
  const agentEmail = view?.agent?.email?.trim() || OFFICE;
  const agentName = view?.agent?.name ?? "there";
  const lines = [
    ["Property", property],
    ["Applicants", offer.applicants],
    ["Offer", offer.amount],
    ...(offer.moveIn ? [["Move-in", offer.moveIn] as [string, string]] : []),
    ...(offer.conditions ? [["Asked for", offer.conditions] as [string, string]] : []),
  ] as [string, string][];

  const text = [
    `Hi ${agentName.split(/\s+/)[0]},`,
    "",
    `${me.name} has pressed Approve on an offer in their property file.`,
    "",
    ...lines.map(([k, v]) => `  ${k}: ${v}`),
    "",
    "Nothing has changed in REX. This is the landlord telling you they are happy",
    "with this applicant - the offer still needs accepting your end.",
    "",
    `Reply to this email and it goes straight back to them (${me.email}).`,
  ].join("\n");

  const html =
    `<p><strong>${esc(me.name)}</strong> has pressed Approve on an offer in their property file.</p>` +
    `<table style="border-collapse:collapse;margin:12px 0">${lines
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 14px 2px 0;color:#777">${esc(k)}</td><td style="padding:2px 0"><strong>${esc(v)}</strong></td></tr>`
      )
      .join("")}</table>` +
    `<p style="color:#777">Nothing has changed in REX. This is the landlord telling you they are happy with this applicant - the offer still needs accepting your end.</p>` +
    `<p>Reply to this email and it goes straight back to them (${esc(me.email)}).</p>`;

  let error = "";
  try {
    await sendEmail({
      to: agentEmail,
      replyTo: me.email,
      subject: `${me.name} has approved an offer on ${property}`,
      html,
      text,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Email failed";
  }
  await markApprovalEmailed(approval.id, error);

  /* The approval is filed either way. A refused email is the agent's problem
     to chase, never a landlord pressing a button that silently did nothing. */
  return NextResponse.json({ ok: true, approval, told: error === "" });
}
