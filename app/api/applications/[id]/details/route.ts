import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { letAccess } from "@/lib/let-people";
import { dealValue, letEditHistory, letEditsNow, saveLetEdits, type LetChange } from "@/lib/let-edits";
import { cleanLetValue, isLetField, LET_FIELD_LABEL, LET_FIELDS, letValueProblem, sameLetValue, sayLetValue, type LetField } from "@/lib/let-edit-fields";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import type { Application } from "@/lib/applications";
import { forgetApplications } from "@/lib/applications";
import { markApplicationsFiled } from "@/lib/applications-board";
import { record } from "@/lib/audit";

/**
 * A LET'S FIGURES, PUT RIGHT ON THE LET (James, 1 Nov 2026) - lib/let-edits.
 *
 * GET  → { canEdit, dealId, edits, history }: the OS's own values for the
 *        move-in, deposit, rent, holding fee and tenancy length, and every
 *        change made on the let (its tenants' too), newest first.
 * POST { changes: { moveIn?: "2026-11-10" | null, deposit?: 1542, ... },
 *        shown: { moveIn?: ..., ... } }  - one Save. `shown` is what the page
 *        showed for each field before, kept as "was" on the history. An
 *        emptied box puts the field back to what the let was read from.
 *        Answers as GET does.
 *
 * Nothing here is ever sent to REX or Propoly.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Raw = { propoly?: (f: LetField) => string | null; app?: (f: LetField) => string | null };

/**
 * What Propoly and the application hold for each figure now, under anything
 * the OS laid over them: kept with a change ("seen") and checked on every
 * read, so a source changed after the OS wins back (the newest figure always
 * wins, James 2 Nov 2026).
 */
async function rawFor(app: Application | null, dealId: string | null): Promise<Raw> {
  const deal = dealId ? (await getAllPropolyDeals().catch(() => null))?.find((d) => d.app.id === dealId) ?? null : null;
  const s = (n: number | null | undefined) => (n == null ? null : String(n));
  return {
    ...(deal ? { propoly: (f: LetField) => (deal.letEdits?.[f] ? deal.letEdits[f]!.propoly : dealValue(deal.app, f)) } : {}),
    ...(app
      ? {
          app: (f: LetField) => {
            if (f === "deposit") return null;
            const mark = app.letEdits?.[f];
            if (mark) return mark.source;
            return f === "moveIn" ? (app.startDate ? app.startDate.slice(0, 10) : null) : f === "rent" ? s(app.offerAmount) : f === "holdingFee" ? s(app.holdingDepositAmount) : s(app.agreementMonths);
          },
        }
      : {}),
  };
}

async function answer(id: string, dealId: string | null, canEdit: boolean, raw: Raw) {
  const [edits, history] = await Promise.all([letEditsNow(id, dealId, raw), letEditHistory(id, dealId)]);
  return NextResponse.json({ ok: true, canEdit, dealId, edits, history });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const a = await letAccess(id, actor);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  if (!hasDb()) return NextResponse.json({ ok: true, canEdit: false, dealId: a.dealId, edits: {}, history: [] });
  try {
    return await answer(id, a.dealId, a.canEdit, await rawFor(a.app, a.dealId));
  } catch {
    return NextResponse.json({ ok: false, error: "The changes on this let couldn't be read just now." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const a = await letAccess(id, actor);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  if (!a.canEdit) return NextResponse.json({ ok: false, error: "Only the let's agent or the office can change its figures." }, { status: 403 });

  const b = ((await req.json().catch(() => null)) ?? {}) as { changes?: Record<string, unknown>; shown?: Record<string, unknown> };
  const asked = b.changes && typeof b.changes === "object" ? b.changes : {};
  const shown = b.shown && typeof b.shown === "object" ? b.shown : {};
  const src = await rawFor(a.app, a.dealId);
  const current = await letEditsNow(id, a.dealId, src);

  const changes: LetChange[] = [];
  const problems: string[] = [];
  for (const [field, raw] of Object.entries(asked)) {
    if (!isLetField(field)) continue;
    const value = cleanLetValue(field, raw);
    if (value === false) { problems.push(letValueProblem(field)); continue; }
    const before = cleanLetValue(field, shown[field]);
    const was = current[field]?.value ?? (before === false ? null : before);
    /* Unchanged: nothing to write. Emptied with nothing held here: nothing to put back. */
    if (current[field] ? sameLetValue(field, value, current[field]!.value) : value === null || sameLetValue(field, value, was)) continue;
    /* What each source holds as this is saved: if one changes after, it is newer. */
    const seen = { ...(src.propoly ? { propoly: src.propoly(field) } : {}), ...(src.app && field !== "deposit" ? { app: src.app(field) } : {}) };
    changes.push({ field, value, was, seen });
  }
  if (problems.length) return NextResponse.json({ ok: false, error: problems.join(" ") }, { status: 400 });
  if (!changes.length) return answer(id, a.dealId, a.canEdit, src);

  const by = { id: actor.id, name: actor.name || actor.email || "unknown", email: actor.email ?? "" };
  await saveLetEdits(id, a.dealId, changes, by);
  /* Every screen reads the let again, not its held copy. */
  forgetApplications();
  markApplicationsFiled();
  const said = changes
    .map((c) => `${LET_FIELD_LABEL[c.field as (typeof LET_FIELDS)[number]]} ${sayLetValue(c.field as (typeof LET_FIELDS)[number], c.was)} -> ${c.value === null ? "back to the source" : sayLetValue(c.field as (typeof LET_FIELDS)[number], c.value)}`)
    .join("; ");
  await record({ kind: "let_figures_changed", actorId: actor.id, actorEmail: actor.email, detail: `Let ${id}${a.dealId ? ` (deal ${a.dealId})` : ""}: ${said}. OS only, not REX or Propoly.` }).catch(() => undefined);
  return answer(id, a.dealId, a.canEdit, src);
}
