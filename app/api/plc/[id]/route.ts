import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { putPlcWithAgent } from "@/lib/plc-updates";
import {
  checkCase,
  decideCase,
  getCase,
  markScanning,
  PlcRefused,
  recordPreflight,
  recordScan,
  reopenCase,
  setRlpWanted,
  submitCase,
  unwaiveCheck,
  updateDetails,
  waiveCheck,
} from "@/lib/plc-store";
import { gateFor, missingDocuments, PLC_CHECKS, rlpAnswered, scanSummary, sortFindings, type CheckId, type PlcCase } from "@/lib/plc";
import { scanCase, scanConfigured, type ScanOutcome } from "@/lib/plc-scan";
import { actorName, currentUser } from "@/lib/plc-actor";
import { isPlcApprover } from "@/lib/plc-approvers";
import { rlpEmail, rlpTeamEmail, sendRlpRequest } from "@/lib/plc-rlp";
import { can } from "@/lib/roles";
import { requireCapability } from "@/lib/admin";
import { recordDecision, recordRecommendation } from "@/lib/plc-shadow";
import { pushCaseToPropoly } from "@/lib/plc-propoly";
import { pushCaseToRex } from "@/lib/plc-rex";
import { recordActivity } from "@/lib/business/deal-watch";
import { switchOn } from "@/lib/switches";
import { isTestCase } from "@/lib/test-guard";
import { moveInToRex } from "@/lib/plc-move-in-rex";

/**
 * GET   /api/plc/<id>  → the case, its findings in reading order, what's short
 * PATCH /api/plc/<id>  → move-in date and the agent's note, while it's theirs
 * POST  /api/plc/<id>  → one of the moves: submit, scan, check, decide, reopen, rlp
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

async function payload(c: PlcCase | null, req: NextRequest) {
  if (!c) return null;
  /* What the person looking may do, so the panel offers the right step
     rather than a button the server will refuse. The server still decides:
     this only saves somebody pressing Approve to be told no. */
  const me = await currentUser(req);
  const email = me?.email?.toLowerCase() ?? null;
  const dryRun = process.env.NODE_ENV !== "production";
  const checker = Boolean(email && c.checkedByEmail && email === c.checkedByEmail);
  const canApprove = dryRun || ((await isPlcApprover(email)) && !checker);
  const rlpOn = c.rlpWanted ? await switchOn("rlp_requests") : false;
  return {
    case: { ...c, findings: sortFindings(c.findings) },
    checks: PLC_CHECKS,
    missing: missingDocuments(c).map((m) => m.id),
    summary: c.scannedAt ? scanSummary(c.findings) : null,
    scanConfigured: scanConfigured(),
    me: {
      canCheck: dryRun || Boolean(me && can(me.role, "work:plc")),
      canApprove,
      /* Why not, in a sentence, when they cannot. */
      approveBlocked: canApprove ? null : checker ? "You did the first check, so the final approval has to be somebody else." : "The final approval is Kirstie's or Michael's.",
    },
    rlp: c.rlpWanted
      ? { preview: rlpEmail(c), teamSet: Boolean(rlpTeamEmail()), switchOn: rlpOn }
      : null,
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const found = await getCase(id);
  if (!found) {
    return NextResponse.json({ ok: false, error: "No handover with that reference." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...(await payload(found, req)) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { moveInDate?: string | null; agentNote?: string; letType?: "home" | "hmo" | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  try {
    const before = await getCase(id);
    const updated = await updateDetails(id, body);
    /* A moved move-in date goes onto the REX application too (6 Oct 2026). */
    let rexMoveIn: { ok: boolean; note: string } | null = null;
    if (updated.moveInDate && before && updated.moveInDate !== before.moveInDate && !isTestCase(updated)) {
      const me = await currentUser(req);
      rexMoveIn = await moveInToRex(updated.applicationRef, updated.moveInDate, me?.id ?? null);
    }
    return NextResponse.json({ ok: true, ...(await payload(updated, req)), ...(rexMoveIn ? { rexMoveIn } : {}) });
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
    wanted?: boolean;
    test?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  /* WHO MAY SIGN IT OFF (18 Sep 2026). Nothing here checked a role: any agent
     could open the harness page, flip it to "compliance" and approve their own
     pack under their own name, and with Certificates into REX on, the approval
     writes. A laptop with no production data keeps the dry run, where one
     person has to play every side.

     Two steps since 30 Sep 2026 (James): anybody holding work:plc may do the
     first check, defer or decline; the final approval is a short named list
     (Kirstie and Michael, lib/plc-approvers), and never the person who did
     the first check on the same pack. */
  const COMPLIANCE_ONLY = new Set(["check", "decide", "push-rex", "push-propoly", "rlp-send"]);
  /* A test file's pack (lib/test-guard isTestCase, 5 Oct 2026): the tester
     plays every side - first check AND final approval, still behind work:plc - so
     Howard can walk the whole check. It is safe because nothing about a test
     pack leaves the OS: no Propoly, no REX, no RLP request to anybody else. */
  const testCase = isTestCase(await getCase(id).catch(() => null));
  if (testCase && (body.action === "push-rex" || body.action === "push-propoly")) {
    return NextResponse.json({ ok: false, error: "This is a test pack, so it stays in the OS and never goes to Propoly or REX." }, { status: 409 });
  }
  const prod = process.env.NODE_ENV === "production";
  if (prod && COMPLIANCE_ONLY.has(body.action ?? "")) {
    if (!(await requireCapability(req, "work:plc"))) {
      return NextResponse.json(
        { ok: false, error: "Only the compliance team can work a pack. Send it to them and they will pick it up." },
        { status: 403 }
      );
    }
  }
  const APPROVER_ONLY = body.action === "decide" && body.decision === "approved";
  if (prod && !testCase && (APPROVER_ONLY || body.action === "push-rex" || body.action === "push-propoly" || body.action === "rlp-send")) {
    const me = await currentUser(req);
    const current = await getCase(id);
    const email = me?.email?.toLowerCase() ?? "";
    if (!(await isPlcApprover(email))) {
      return NextResponse.json({ ok: false, error: "The final approval is Kirstie's or Michael's." }, { status: 403 });
    }
    if (APPROVER_ONLY && current?.checkedByEmail && current.checkedByEmail === email) {
      return NextResponse.json(
        { ok: false, error: "You did the first check on this one, so the final approval has to be somebody else." },
        { status: 403 }
      );
    }
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
        if (!rlpAnswered(current)) {
          return NextResponse.json(
            { ok: false, error: "Say whether the landlord wants Rent and Legal Protection first.", ...(await payload(current, req)) },
            { status: 409 }
          );
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
              ...(await payload(current, req)),
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
                ...(await payload(held, req)),
              },
              { status: 409 }
            );
          }
        }

        const submitted = await submitCase(id);
        if (!testCase) await recordActivity({
          id: submitted.id,
          property: submitted.address,
          agentEmail: submitted.agentEmail || null,
          agentName: submitted.agentName,
          event: "plc_submitted",
          from: current.decidedAt ? "deferred" : null,
          to: "submitted",
        });
        if (!outcome) return NextResponse.json({ ok: true, ...(await payload(submitted, req)) });

        await markScanning(id);
        const scanned = await recordScan(id, outcome.findings);
        if (outcome.recommendation && !testCase) {
          await recordRecommendation({
            caseId: id,
            address: scanned.address,
            verdict: outcome.recommendation.verdict,
            headline: outcome.recommendation.headline,
            perCheck: outcome.recommendation.perCheck,
            submittedAt: scanned.submittedAt,
          });
        }
        return NextResponse.json({ ok: true, ...(await payload(scanned, req)) });
      }

      case "push-rex": {
        /* By hand, on an approved pack: the supervised first write, or a
           retry after REX refused one. */
        const by = await actorName(req, "Compliance");
        try {
          await pushCaseToRex(id, by);
        } catch (e) {
          return NextResponse.json({ ok: false, error: publicError(e, "push failed") }, { status: 409 });
        }
        const pushed = await getCase(id);
        return NextResponse.json({ ok: true, ...(await payload(pushed!, req)) });
      }

      case "push-propoly": {
        /* By hand, on an approved pack: the first push after the switch goes
           on, or a retry after a slot failed. */
        const by = await actorName(req, "Compliance");
        try {
          await pushCaseToPropoly(id, by);
        } catch (e) {
          return NextResponse.json({ ok: false, error: publicError(e, "push failed") }, { status: 409 });
        }
        const pushed = await getCase(id);
        return NextResponse.json({ ok: true, ...(await payload(pushed!, req)) });
      }

      case "check": {
        /* The first check. Passes the pack to Kirstie or Michael; nothing
           leaves the building and the agent is not told anything yet. */
        const me = await currentUser(req);
        const by = await actorName(req, "Compliance");
        const checked = await checkCase(id, { name: by, email: me?.email ?? null }, body.note ?? "");
        if (!testCase) await recordActivity({
          id: checked.id,
          property: checked.address,
          agentEmail: checked.agentEmail || null,
          agentName: checked.agentName,
          event: "plc_checked",
          from: "reviewing",
          to: "checked",
        });
        return NextResponse.json({ ok: true, ...(await payload(checked, req)) });
      }

      case "rlp": {
        /* The agent's yes or no, while the pack is still theirs. */
        if (typeof body.wanted !== "boolean") {
          return NextResponse.json({ ok: false, error: "Yes or no." }, { status: 400 });
        }
        const set = await setRlpWanted(id, body.wanted);
        return NextResponse.json({ ok: true, ...(await payload(set, req)) });
      }

      case "rlp-send": {
        /* The RLP request to Legal for Landlords, or with test: true a copy
           to the sender's own inbox. From their own Outlook either way. */
        const me = await currentUser(req);
        if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
        try {
          /* A test pack's request only ever goes to the sender. */
          const sent = await sendRlpRequest(id, { id: me.id, name: me.name, email: me.email }, { test: body.test === true || testCase });
          const fresh = await getCase(id);
          return NextResponse.json({ ok: true, sentTo: sent.sentTo, ...(await payload(fresh, req)) });
        } catch (e) {
          const fresh = await getCase(id);
          return NextResponse.json(
            { ok: false, error: publicError(e, "The send failed."), ...(await payload(fresh, req)) },
            { status: 409 }
          );
        }
      }

      case "waive": {
        const by = await actorName(req, "Agent");
        const waived = await waiveCheck(id, (body.checkId ?? "") as CheckId, body.reason ?? "", by);
        return NextResponse.json({ ok: true, ...(await payload(waived, req)) });
      }

      case "unwaive": {
        const back = await unwaiveCheck(id, (body.checkId ?? "") as CheckId);
        return NextResponse.json({ ok: true, ...(await payload(back, req)) });
      }

      case "reopen": {
        const reopened = await reopenCase(id);
        return NextResponse.json({ ok: true, ...(await payload(reopened, req)) });
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
                message: `The scan didn't finish — ${publicError(e, "unknown error")}. Nothing below has been read automatically.`,
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
        if (outcome.recommendation && !testCase) {
          await recordRecommendation({
            caseId: id,
            address: scanned.address,
            verdict: outcome.recommendation.verdict,
            headline: outcome.recommendation.headline,
            perCheck: outcome.recommendation.perCheck,
            submittedAt: scanned.submittedAt,
          });
        }
        return NextResponse.json({ ok: true, ...(await payload(scanned, req)) });
      }

      case "skip-scan": {
        /* Straight to review with no findings. The transition table allows
           submitted → reviewing precisely for this: no API key, or a pack
           Kirstie would rather just read. */
        const skipped = await recordScan(id, []);
        return NextResponse.json({ ok: true, ...(await payload(skipped, req)) });
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
        const before = await getCase(id);
        const decided = await decideCase(id, decision, by, body.note ?? "");
        /* After the decision lands, never before. Recording cannot throw, so a
           log failure can never cost Kirstie an approval. */
        if (!testCase) await recordDecision({ caseId: id, decision, decidedBy: by, note: body.note ?? "" });
        if (!testCase) await recordActivity({
          id: decided.id,
          property: decided.address,
          agentEmail: decided.agentEmail || null,
          agentName: decided.agentName,
          event: "plc_decided",
          from: before?.state ?? "checked",
          to: decision,
        });
        /* The landlord hears it from the agent, never from here (2 Oct 2026). */
        await putPlcWithAgent(decided, decision).catch(() => null);
        /* Approved, and the switch is on: the pack goes into Propoly's slots
           now, so she can generate the agreement without uploading anything.
           A push that fails is recorded on the case and never undoes the
           approval - the decision is hers, the upload is a courtesy. */
        /* Two pushes, each behind its own switch, each recorded on the case
           and neither able to undo the approval. Propoly so Kirstie can
           generate the agreement; REX so the certificates count on the
           tracker and in REX PM (5 Sep). */
        const [propoly, rex] = await Promise.all([switchOn("propoly_documents"), switchOn("rex_compliance_write")]);
        if (decision === "approved" && (propoly || rex) && !testCase) {
          if (propoly) {
            try {
              await pushCaseToPropoly(id, by);
            } catch {
              /* recorded on the case where it could be; the approval stands */
            }
          }
          if (rex) {
            try {
              await pushCaseToRex(id, by);
            } catch {
              /* as above */
            }
          }
          const after = await getCase(id);
          return NextResponse.json({ ok: true, ...(await payload(after ?? decided, req)) });
        }
        return NextResponse.json({ ok: true, ...(await payload(decided, req)) });
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
    { ok: false, error: publicError(e, "That didn't work.") },
    { status: 500 }
  );
}
