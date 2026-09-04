import { NextRequest, NextResponse } from "next/server";
import {
  decideCase,
  getCase,
  markScanning,
  PlcRefused,
  recordPreflight,
  recordScan,
  reopenCase,
  submitCase,
  unwaiveCheck,
  updateDetails,
  waiveCheck,
} from "@/lib/plc-store";
import { gateFor, missingDocuments, PLC_CHECKS, scanSummary, sortFindings, type CheckId } from "@/lib/plc";
import { scanCase, scanConfigured, type ScanOutcome } from "@/lib/plc-scan";
import { actorName } from "@/lib/plc-actor";
import { recordDecision, recordRecommendation } from "@/lib/plc-shadow";

/**
 * GET   /api/plc/<id>  → the case, its findings in reading order, what's short
 * PATCH /api/plc/<id>  → move-in date and the agent's note, while it's theirs
 * POST  /api/plc/<id>  → one of the moves: submit, scan, decide, reopen
 *
 * The moves are one route with an `action` rather than four sibling files,
 * because they are all the same shape -- ask the store, catch a refusal,
 * answer with the case. Splitting them would put four copies of the same
 * error handling in four places, and the refusal text is the part that
 * matters here.
 *
 * Every one of them is a POST to the STORE, never a write of `state` from
 * here. lib/plc-store is the only thing that consults PLC_TRANSITIONS, so a
 * route cannot skip a step even by accident.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* The scan is one API call per document, sequentially. A nine-document pack
   can sit well past the default. */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

function payload(c: Awaited<ReturnType<typeof getCase>>) {
  if (!c) return null;
  return {
    case: { ...c, findings: sortFindings(c.findings) },
    checks: PLC_CHECKS,
    missing: missingDocuments(c).map((m) => m.id),
    summary: c.scannedAt ? scanSummary(c.findings) : null,
    scanConfigured: scanConfigured(),
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const found = await getCase(id);
  if (!found) {
    return NextResponse.json({ ok: false, error: "No handover with that reference." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...payload(found) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { moveInDate?: string | null; agentNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  try {
    const updated = await updateDetails(id, body);
    return NextResponse.json({ ok: true, ...payload(updated) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: {
    action?: string;
    decision?: "approved" | "deferred" | "declined";
    note?: string;
    checkId?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "submit": {
        /* ── The gate, then the preflight, then the send ──────────────────
           Kirstie, 4 Sep: a pack reaching the check with an empty slot fails
           it, and the failed check is charged to TLE. So nothing leaves the
           agent until every required slot is filled, every conditional one
           is filled or explained, and the reader has found nothing that
           would fail on the move-in date. The reader's findings then travel
           with the pack, so Kirstie opens a scanned case rather than pressing
           scan herself. */
        const current = await getCase(id);
        if (!current) {
          return NextResponse.json({ ok: false, error: "That handover no longer exists." }, { status: 404 });
        }
        const gate = gateFor(current);
        if (!gate.ready) {
          return NextResponse.json(
            {
              ok: false,
              error: gate.blocked.length
                ? `Can't send without: ${gate.blocked.map((k) => k.label).join(", ")}.`
                : `Say why these aren't needed, or attach them: ${gate.askWhy.map((k) => k.label).join(", ")}.`,
              gate: { blocked: gate.blocked.map((k) => k.id), askWhy: gate.askWhy.map((k) => k.id) },
              ...payload(current),
            },
            { status: 409 }
          );
        }

        let outcome: ScanOutcome | null = null;
        if (scanConfigured() && current.state === "assembling" && current.moveInDate) {
          try {
            outcome = await scanCase(current);
          } catch {
            /* A reader that fails is not a reason to hold the pack: it goes
               through unscanned and Kirstie reads it, as before the reader
               existed. */
            outcome = null;
          }
        }
        if (outcome) {
          const blockers = outcome.findings.filter((f) => f.level === "blocker");
          if (blockers.length) {
            const held = await recordPreflight(id, outcome.findings);
            return NextResponse.json(
              {
                ok: false,
                error: `The reader found ${blockers.length} thing${blockers.length === 1 ? "" : "s"} that would fail the check. Fix ${
                  blockers.length === 1 ? "it" : "them"
                } and send again.`,
                ...payload(held),
              },
              { status: 409 }
            );
          }
        }

        const submitted = await submitCase(id);
        if (!outcome) return NextResponse.json({ ok: true, ...payload(submitted) });

        await markScanning(id);
        const scanned = await recordScan(id, outcome.findings);
        if (outcome.recommendation) {
          await recordRecommendation({
            caseId: id,
            address: scanned.address,
            verdict: outcome.recommendation.verdict,
            headline: outcome.recommendation.headline,
            perCheck: outcome.recommendation.perCheck,
            submittedAt: scanned.submittedAt,
          });
        }
        return NextResponse.json({ ok: true, ...payload(scanned) });
      }

      case "waive": {
        const by = await actorName(req, "Agent");
        const waived = await waiveCheck(id, (body.checkId ?? "") as CheckId, body.reason ?? "", by);
        return NextResponse.json({ ok: true, ...payload(waived) });
      }

      case "unwaive": {
        const back = await unwaiveCheck(id, (body.checkId ?? "") as CheckId);
        return NextResponse.json({ ok: true, ...payload(back) });
      }

      case "reopen": {
        const reopened = await reopenCase(id);
        return NextResponse.json({ ok: true, ...payload(reopened) });
      }

      case "scan": {
        /* Marked scanning FIRST so the queue shows it as busy while it runs -
           a nine-document pack takes long enough that a second person would
           otherwise start the same scan. If the read then throws, the case
           still lands in reviewing below rather than sticking on scanning
           forever: an unscannable pack is Kirstie's to read, not a dead end. */
        const busy = await markScanning(id);
        let outcome;
        try {
          outcome = await scanCase(busy);
        } catch (e) {
          outcome = {
            findings: [
              {
                checkId: "tenancy-agreement" as const,
                level: "query" as const,
                message: `The scan didn't finish — ${e instanceof Error ? e.message : "unknown error"}. Nothing below has been read automatically.`,
                foundDate: null,
              },
            ],
            recommendation: null,
          };
        }
        const scanned = await recordScan(id, outcome.findings);
        /* The shadow log, written the moment the recommendation exists and
           BEFORE anybody has seen it. That ordering is the measurement: a
           prediction recorded after the decision is not a prediction.

           A scan that threw records nothing rather than recording a guess -
           there was no recommendation to be right or wrong about. */
        if (outcome.recommendation) {
          await recordRecommendation({
            caseId: id,
            address: scanned.address,
            verdict: outcome.recommendation.verdict,
            headline: outcome.recommendation.headline,
            perCheck: outcome.recommendation.perCheck,
            submittedAt: scanned.submittedAt,
          });
        }
        return NextResponse.json({ ok: true, ...payload(scanned) });
      }

      case "skip-scan": {
        /* Straight to review with no findings. The transition table allows
           submitted → reviewing precisely for this: no API key, or a pack
           Kirstie would rather just read. */
        const skipped = await recordScan(id, []);
        return NextResponse.json({ ok: true, ...payload(skipped) });
      }

      case "decide": {
        const decision = body.decision;
        if (decision !== "approved" && decision !== "deferred" && decision !== "declined") {
          return NextResponse.json(
            { ok: false, error: "A decision has to be approve, defer or decline." },
            { status: 400 }
          );
        }
        const by = await actorName(req, "Compliance");
        const decided = await decideCase(id, decision, by, body.note ?? "");
        /* After the decision lands, never before. Recording cannot throw, so a
           log failure can never cost Kirstie an approval. */
        await recordDecision({ caseId: id, decision, decidedBy: by, note: body.note ?? "" });
        return NextResponse.json({ ok: true, ...payload(decided) });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}

/** A refusal is a 409 with a sentence; anything else is ours and is a 500. */
function fail(e: unknown) {
  if (e instanceof PlcRefused) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
  }
  return NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : "That didn't work." },
    { status: 500 }
  );
}
