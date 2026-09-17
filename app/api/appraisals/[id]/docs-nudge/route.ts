import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getAppraisal } from "@/lib/appraisal-store";
import { landlordAccountByEmail, landlordByEmail, landlordDocuments, REQUIRED_DOC_KINDS, upsertLandlordAccount } from "@/lib/landlord-account";
import { epcForAddress } from "@/lib/epc";
import { startVerification } from "@/lib/verification";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/** "Just the paperwork left" - from the end of the take-on write-up. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  const to = (ma.landlordEmail ?? "").trim().toLowerCase();
  if (!to.includes("@")) return NextResponse.json({ ok: false, error: `No email address on ${ma.landlord}.` }, { status: 409 });

  const match = await landlordByEmail(to);
  if (match) await upsertLandlordAccount(match);
  const account = await landlordAccountByEmail(to);
  const docs = account ? await landlordDocuments(account.id).catch(() => []) : [];
  const epc = await epcForAddress(ma.address, ma.postcode ?? "").catch(() => null);
  const missing = REQUIRED_DOC_KINDS.filter((k) => !docs.some((d) => d.kind === k.id) && !(k.id === "epc" && epc)).map((k) => k.label.toLowerCase());
  if (!missing.length) return NextResponse.json({ ok: false, error: `${ma.landlord} has already sent everything.` }, { status: 409 });

  try {
    const { token } = await startVerification(to, "landlord");
    const what = list(missing);
    const { subject, html } = renderTleEmail("landlord-docs-nudge", {
      firstName: ma.landlord.trim().split(/\s+/)[0] || "there",
      address: ma.address.split(",")[0].trim() || ma.address,
      what,
      whatCap: what.replace(/^./, (c) => c.toUpperCase()),
      link: `${publicOrigin(req)}/landlord/enter?token=${encodeURIComponent(token)}&next=/landlord/documents`,
    });
    await sendEmail({ to, subject, html, audience: "customer", replyTo: actor.email || undefined });
    return NextResponse.json({ ok: true, message: `Sent to ${to}, naming ${what}.` });
  } catch (e) {
    if (e instanceof ResendBlocked) return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "It didn't send." }, { status: 502 });
  }
}
