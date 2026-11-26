import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { record } from "@/lib/audit";
import { currentMonth } from "@/lib/business/format";
import { lookFor } from "@/lib/new-look-store";
import { kickRecruitmentSync, readRecruitment, setRecruitmentScope, type ScopeKind } from "@/lib/business/recruitment-figures";

/**
 * Company Figures > Recruitment (James, 26 Nov 2026).
 *
 *   GET  ?month=YYYY-MM     the month's hiring figures, counted from Teamtailor
 *   POST { scope }          which part of the Teamtailor account is ours
 *   POST { refresh: true }  read Teamtailor again now
 *
 * see:business, and only while the "recruitment" switch is on for the person.
 * Counts only - no candidate is ever read (lib/business/recruitment-figures).
 * A month in the future is answered as this month, so the tab rolls over on
 * its own.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function allowed(req: NextRequest) {
  const me = await requireCapability(req, "see:business");
  if (!me) return null;
  const look = await lookFor(me).catch(() => null);
  return look?.recruitment ? me : null;
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const asked = req.nextUrl.searchParams.get("month");
  const month = asked && /^\d{4}-\d{2}$/.test(asked) && asked <= currentMonth() ? asked : currentMonth();
  try {
    return NextResponse.json({ ok: true, month, ...(await readRecruitment(month)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The recruitment figures could not be read.") }, { status: 500 });
  }
}

const KINDS: ScopeKind[] = ["all", "division", "department", "location"];

export async function POST(req: NextRequest) {
  const me = await allowed(req);
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { scope?: { kind?: string; name?: string }; refresh?: boolean };
  if (body.refresh) {
    const started = await kickRecruitmentSync();
    return NextResponse.json({ ok: true, started });
  }
  const kind = body.scope?.kind as ScopeKind | undefined;
  const name = typeof body.scope?.name === "string" ? body.scope.name.trim() : "";
  if (!kind || !KINDS.includes(kind) || (kind !== "all" && !name)) {
    return NextResponse.json({ ok: false, error: "Which part of Teamtailor?" }, { status: 400 });
  }
  try {
    await setRecruitmentScope({ kind, name }, me.email);
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That did not save.") }, { status: 400 });
  }
  await record({ kind: "switch_changed", actorId: me.id, actorEmail: me.email, detail: `Recruitment figures count ${kind === "all" ? "the whole Teamtailor account" : `${kind} ${name}`}` }).catch(() => {});
  return NextResponse.json({ ok: true });
}
