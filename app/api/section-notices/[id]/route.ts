import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import {
  decideNotice, getNotice, recordService, saveAnswers, saveReview, submitNotice, withdrawNotice,
  type Refusal,
} from "@/lib/section-notices";
import { asAnswers, type Decision, type PostService, type Review } from "@/lib/section-notices-spec";

/**
 * One Section 13 or Section 8 notice.
 *
 * GET   → the notice, its files and its history.
 * PATCH, the agent:
 *   { answers }                 saved as they go (draft or returned only)
 *   { action: "submit" }        off to compliance, checked here first
 *   { action: "withdraw" }      taken back, before a decision
 * PATCH, compliance (see:agent-compliance):
 *   { action: "review", review }           his ticks, saved as he goes
 *   { action: "decide", review }           approved / returned / legal / declined
 *   { action: "service", post, served }    after approval: how and when it was served
 *
 * Nothing here serves a notice or writes to anybody. Michael serves it
 * through PayProp himself (James, 7 Oct 2026).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const notice = await getNotice(id);
  if (!notice) return NextResponse.json({ ok: false, error: "That notice is not there any more." }, { status: 404 });
  return NextResponse.json({ ok: true, notice });
}

const answer = (r: { ok: true; notice: unknown } | Refusal) =>
  r.ok ? NextResponse.json({ ok: true, notice: r.notice }) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });

function asReview(v: unknown): Review {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Review>;
  const checks: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(o.checks ?? {})) if (x === true) checks[k.slice(0, 60)] = true;
  const d = o.decision as Decision | null | undefined;
  return {
    checks,
    decision: d === "approved" || d === "returned" || d === "legal" || d === "declined" ? d : null,
    comments: typeof o.comments === "string" ? o.comments.slice(0, 4000) : "",
  };
}

function asPost(v: unknown): PostService {
  const o = (v && typeof v === "object" ? v : {}) as Partial<PostService>;
  const checks: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(o.checks ?? {})) if (x === true) checks[k.slice(0, 60)] = true;
  return {
    checks,
    servedOn: typeof o.servedOn === "string" ? o.servedOn.slice(0, 10) : "",
    method: typeof o.method === "string" ? o.method.slice(0, 200) : "",
  };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (subject && subject.id !== actor.id) {
    return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to change it in your own name." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; answers?: unknown; review?: unknown; post?: unknown; served?: boolean };
  const who = { id: actor.id, name: actor.name || actor.email, email: actor.email };

  try {
    if (!b.action && b.answers !== undefined) return answer(await saveAnswers(id, asAnswers(b.answers)));
    if (b.action === "submit") return answer(await submitNotice(id, who));
    if (b.action === "withdraw") return answer(await withdrawNotice(id, who));

    if (b.action === "review" || b.action === "decide" || b.action === "service") {
      if (!can(actor.role, "see:agent-compliance")) {
        return NextResponse.json({ ok: false, error: "Only compliance decides these." }, { status: 403 });
      }
      if (b.action === "review") return answer(await saveReview(id, asReview(b.review)));
      if (b.action === "decide") return answer(await decideNotice(id, asReview(b.review), who));
      return answer(await recordService(id, asPost(b.post), b.served === true, who));
    }
    return NextResponse.json({ ok: false, error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Not saved." }, { status: 502 });
  }
}
