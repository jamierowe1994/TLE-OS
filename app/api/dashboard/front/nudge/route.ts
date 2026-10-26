import { NextRequest, NextResponse } from "next/server";
import { getAppraisal } from "@/lib/appraisal-store";
import { NudgeRefused, sendContractNudge } from "@/lib/contract-nudge";
import { renderPlain } from "@/lib/campaign-mail";
import { esignRemindWording, ESIGN_REMIND_KICKER } from "@/lib/esign-remind";
import { Say, frontCtx, termInScope } from "@/lib/front-dash-reads";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { ResendBlocked } from "@/lib/resend";
import { esignRequest } from "@/lib/rex-esign";
import { sendAsAgent } from "@/lib/send-as-agent";
import { emailParties } from "@/lib/terms/flow";
import { getTerms } from "@/lib/terms/store";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST /api/dashboard/front/nudge { id } - nudge one set of terms from the
 * dashboard's Terms out list (James, 25 Oct 2026: "the ability to send a nudge
 * to these people in a really clean and clear format").
 *
 * The id is the list's own (page:<terms>, docuseal:<appraisal>, esign:<request>);
 * the rows never carry an email address, so who it goes to is worked out here.
 * Only a set the person can see in their own list can be nudged, and each kind
 * goes the way its own screen sends it:
 *   page      the landlord's own link again, to everyone yet to sign (lib/terms)
 *   docuseal  the contract nudge from the appraisal (lib/contract-nudge)
 *   esign     the agent's note pointing at the DocuSign email (lib/esign-remind)
 * Every one goes from the signed-in person's own mailbox.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const no = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return no(e.message, 423);
    throw e;
  }
  const ctx = await frontCtx(req);
  const me = ctx?.who.actor;
  if (!ctx || !me) return no("Sign in first.", 401);
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const [kind, ref] = String(id ?? "").split(/:(.*)/s);
  if (!ref || !["page", "docuseal", "esign"].includes(kind)) return no("Which terms?");

  try {
    if (!(await termInScope(ctx, String(id)))) return no("Those terms aren't in your list any more.", 404);
    const origin = publicOrigin(req);

    if (kind === "page") {
      const t = await getTerms(ref);
      if (!t || t.status !== "sent") return no("Those terms aren't out any more.", 409);
      if (t.agentId !== me.id && me.role !== "owner" && me.role !== "super_admin") return no("Only the agent who sent these can nudge them.", 403);
      const keys = t.parties.filter((p) => !p.signedAt).map((p) => p.key);
      const after = await emailParties(t, me, origin, keys);
      const failed = after.filter((p) => keys.includes(p.key) && p.emailError);
      if (failed.length === keys.length) return no(failed[0]?.emailError ?? "That didn't send.", 502);
      const to = after.filter((p) => keys.includes(p.key) && !p.emailError).map((p) => p.name);
      return NextResponse.json({ ok: true, to: to.join(" & ") });
    }

    if (kind === "docuseal") {
      const ma = await getAppraisal(ref);
      if (!ma) return no("That appraisal isn't on file any more.", 404);
      const { to } = await sendContractNudge({ ma, origin, by: me.name || me.email });
      return NextResponse.json({ ok: true, to });
    }

    const r = await esignRequest(ref);
    const landlord = r?.signers.find((s) => s.role.toLowerCase() !== "agent" && s.email.includes("@"));
    if (!r || !landlord) return no("That landlord has no email address on the request, so there's nothing to send to.");
    const text = esignRemindWording({
      landlordFirst: landlord.name.trim().split(/\s+/)[0] || "there",
      address: "",
      sentAt: r.sentAt,
      agentName: me.name,
      agentPhone: "0161 883 2525",
    });
    const mail = renderPlain(text.subject, text.text, { landlord: true, kicker: ESIGN_REMIND_KICKER });
    const sent = await sendAsAgent({ me, to: landlord.email, toName: landlord.name || undefined, subject: mail.subject, html: mail.html });
    if (!sent.sent) return no(sent.detail, sent.reason === "no_address" ? 400 : 502);
    return NextResponse.json({ ok: true, to: landlord.name || "the landlord" });
  } catch (e) {
    if (e instanceof NudgeRefused || e instanceof Say) return no(e.message, 409);
    if (e instanceof ResendBlocked) return no(e.message, 503);
    return no(publicError(e, "That didn't send."), 500);
  }
}
