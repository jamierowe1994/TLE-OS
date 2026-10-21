import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { publicError } from "@/lib/public-error";
import { homeContext, isRefusal } from "@/lib/home-send";
import { addrOf } from "@/lib/address-parse";
import { candidatesFor, linkThread, pollThreads, ThreadRefused, threadsForCase, threadsForHome, unlinkThread } from "@/lib/mail-threads";

/**
 * Email threads on a PLC, logged on the file (lib/mail-threads, 21 Oct 2026).
 *
 *   GET  ?case=<plc id>                      the pack's threads, every message logged
 *   GET  ?listing=<id>&listings=<id,id>      the home's, for its page (the home must be in your book)
 *   POST { action: "candidates", case, search? }   your own Outlook conversations about the home
 *        { action: "link", case, conversationId, subject }   put one on the pack, read now
 *        { action: "unlink", id }                stop reading a thread (what was logged stays)
 *        { action: "check", case }               read the pack's threads now, not in five minutes
 *
 * The pack's threads are for the office (pre-tenancy and compliance, who work
 * the pack); a home's page shows its threads to whoever has the home in their book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const list = (v: string | null) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

async function office(req: NextRequest) {
  const who = await whoIs(req).catch(() => null);
  const me = who?.actor ?? null;
  if (!me) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  if (!can(me.role, "see:pretenancy") && !can(me.role, "work:plc")) {
    return { error: NextResponse.json({ ok: false, error: "The emails on a pack are for the pre-tenancy and compliance team." }, { status: 403 }) };
  }
  return { me, viewingAs: Boolean(who?.viewingAs) };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const caseId = (sp.get("case") ?? "").trim();
    if (caseId) {
      const o = await office(req);
      if ("error" in o) return o.error;
      return NextResponse.json({ ok: true, me: o.me.id, threads: await threadsForCase(caseId) });
    }
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), list(sp.get("listings")));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const ids = [...new Set(ctx.all.map((p) => String(p.propertyId ?? "")).filter(Boolean))];
    const addresses = [...new Set([...ctx.lets, ...ctx.all, ctx.home].map((p) => addrOf(p)).filter(Boolean))];
    return NextResponse.json({ ok: true, threads: await threadsForHome(ids, addresses) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The emails couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const o = await office(req);
  if ("error" in o) return o.error;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(b?.action ?? "");
  const caseId = String(b?.case ?? "").trim();
  try {
    if (action === "candidates") {
      if (o.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first: only your own Outlook is searched." }, { status: 403 });
      return NextResponse.json({ ok: true, candidates: await candidatesFor(caseId, o.me.id, typeof b?.search === "string" ? b.search : undefined) });
    }
    if (action === "link") {
      if (o.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first: only your own Outlook can be linked." }, { status: 403 });
      const conversationId = String(b?.conversationId ?? "").trim();
      if (!caseId || !conversationId) return NextResponse.json({ ok: false, error: "Which email?" }, { status: 400 });
      const r = await linkThread({ caseId, userId: o.me.id, by: o.me.name || o.me.email, conversationId, subject: String(b?.subject ?? "") });
      return NextResponse.json({ ok: true, ...r, threads: await threadsForCase(caseId) });
    }
    if (action === "unlink") {
      await unlinkThread(String(b?.id ?? ""), o.me.name || o.me.email);
      return NextResponse.json({ ok: true, threads: caseId ? await threadsForCase(caseId) : [] });
    }
    if (action === "check") {
      if (!caseId) return NextResponse.json({ ok: false, error: "Which pack?" }, { status: 400 });
      const run = await pollThreads({ caseId });
      return NextResponse.json({ ok: true, run, threads: await threadsForCase(caseId) });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof ThreadRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work just now. Try again in a minute.") }, { status: 500 });
  }
}
