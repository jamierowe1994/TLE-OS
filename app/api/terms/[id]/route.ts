import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { agentSign, agentSigned, cancelTerms, emailParties, TermsRefused } from "@/lib/terms/flow";
import { getTerms } from "@/lib/terms/store";
import { forStaff } from "@/lib/terms/staff";

/**
 * One set of terms, from the agent's side.
 *
 *   POST { action: "agent-signed" }        -> checked with DocuSeal, then every landlord is emailed
 *   POST { action: "agent-sign", signature, keep? } -> signed on our page (24 Oct 2026), sealed by DocuSeal, then emailed
 *   POST { action: "remind", key? }        -> that person's email again; no key, everyone yet to sign
 *   POST { action: "cancel" }              -> withdrawn; the links stop working
 *
 * The agent who sent them, or an owner.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const t = await getTerms(id);
  if (!t) return NextResponse.json({ ok: false, error: "Those terms aren't on file." }, { status: 404 });
  if (t.agentId !== actor.id && actor.role !== "owner" && actor.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Only the agent who sent these can change them." }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { action?: string; key?: string; signature?: unknown; keep?: boolean };
  const origin = publicOrigin(req);
  try {
    if (b.action === "agent-signed") await agentSigned(id, origin, actor.id === t.agentId ? actor : null);
    else if (b.action === "agent-sign") {
      await agentSign(id, actor, b.signature, origin, { ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: req.headers.get("user-agent") }, Boolean(b.keep));
    }
    else if (b.action === "remind") {
      if (b.key && !t.parties.some((p) => p.key === b.key)) throw new TermsRefused("Who should it go to?");
      if (!t.agentSignedAt) throw new TermsRefused("Sign your part first, then it goes to them.");
      if (t.status !== "sent") throw new TermsRefused(t.status === "signed" ? "Everyone has signed." : "Those terms were withdrawn.");
      const keys = b.key ? [b.key] : t.parties.filter((p) => !p.signedAt).map((p) => p.key);
      await emailParties(t, actor, origin, keys);
    } else if (b.action === "cancel") await cancelTerms(id);
    else throw new TermsRefused("What should happen to them?");
    return NextResponse.json({ ok: true, terms: forStaff((await getTerms(id))!, origin) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work.") }, { status: e instanceof TermsRefused ? 400 : 502 });
  }
}
