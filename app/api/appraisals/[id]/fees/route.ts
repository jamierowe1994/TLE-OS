import { NextRequest, NextResponse } from "next/server";
import { appraisalRefusal } from "@/lib/appraisal-access";
import { whoIs } from "@/lib/admin";
import { getAppraisal, recordValuation } from "@/lib/appraisal-store";
import { followFile } from "@/lib/intro-only";
import { effectiveStage, SERVICE_LEVELS, type MarketAppraisal, type ServiceLevel } from "@/lib/market-appraisal";
import { changeDeckFigures, presentationsFor } from "@/lib/present-store";
import { contractSendRecord } from "@/lib/contract-send";
import { termsParties } from "@/lib/docuseal";
import { signedFor } from "@/lib/signed-documents";
import { addTouch } from "@/lib/lead-touches";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { publicError } from "@/lib/public-error";

/**
 * CHANGE THE FEES after the post-appraisal presentation has gone out.
 *
 * James Crumpton, 14 Oct 2026: "we need an option for the post appraisal
 * presentation to be able to go back in and amend the fees etc incase the
 * landlord and agent have agreed a different fee or service after the
 * original conversation."
 *
 *   GET  → the figures as they stand, the deck they sit on, and where the
 *          terms of business have got to, so the screen can warn first
 *   POST → { serviceLevel, feePct, setupFee, otherFees, reason }
 *
 * One save does three things, in this order:
 *
 *  1. The APPRAISAL RECORD - the one home for the figures. The terms of
 *     business are drawn up from it (app/api/docuseal/sign), so whatever goes
 *     out after this carries the new ones. It stamps valued_at, which is what
 *     makes Prepare and send treat a signature from before as stale.
 *  2. The DECK behind the same link - only the terms beside the figure, plus
 *     "Updated <date>" for the landlord (lib/present-store changeDeckFigures).
 *  3. A NOTE ON THE LEAD saying what moved from what to what, who did it and
 *     why. That is the record of each change.
 *
 * It never touches a contract. DocuSeal, REX and the landlord's inbox are not
 * written from here: terms already sent need drawing up again and signing by
 * the agent on Prepare and send (their link then opens the new ones), and
 * signed terms are never changed by anything in the OS.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Figures = {
  serviceLevel: ServiceLevel | null;
  feePct: number | null;
  setupFee: number | null;
  otherFees: string | null;
};

/** Where the contract has got to, read rather than stored (as the terms route does). */
type TermsState = {
  /** Drawn up in DocuSeal (or the test sheet), whether or not it went anywhere. */
  drawnUp: boolean;
  /** Emailed to the landlord: when, and to whom. */
  sentAt: string | null;
  sentTo: string | null;
  /** The landlord has signed. A date when we know it; "signed" alone when only the stage says so. */
  signed: boolean;
  signedAt: string | null;
};

async function termsStateFor(ma: MarketAppraisal): Promise<TermsState> {
  const [sent, rows, parties] = await Promise.all([
    contractSendRecord(ma.id).catch(() => null),
    signedFor(ma.id).catch(() => []),
    /* termsParties answers a test file from the OS alone; a real one needs
       DocuSeal, and a read that fails is "not known", never "not signed". */
    termsParties(ma.id).catch(() => null),
  ]);
  const landlord = parties?.find((p) => p.role === "landlord") ?? null;
  const stage = effectiveStage(ma);
  const signedRow = rows.find((r) => r.completed_at);
  const signedAt = landlord?.completedAt ?? (signedRow?.completed_at ? new Date(signedRow.completed_at).toISOString() : null);
  const signed =
    Boolean(signedAt) ||
    stage === "takeon" ||
    stage === "aml" ||
    stage === "won" ||
    (ma.ticks ?? []).some((t) => t.id === "terms-signed" && t.done);
  return {
    drawnUp: Boolean(ma.termsSentAt) || Boolean(parties?.length),
    sentAt: sent?.lastSentAt ?? null,
    sentTo: sent?.to ?? null,
    signed,
    signedAt,
  };
}

/** The newest post-appraisal deck on the file, under the lead or the appraisal. */
async function postDeckFor(ma: MarketAppraisal) {
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const rows = (await Promise.all(refs.map((r) => presentationsFor(r)))).flat();
  return rows.filter((r) => r.kind === "post-appraisal").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
}

const figuresOf = (ma: MarketAppraisal): Figures => ({
  serviceLevel: ma.serviceLevel ?? null,
  feePct: ma.feePct ?? null,
  setupFee: ma.setupFee ?? null,
  otherFees: ma.otherFees?.trim() || null,
});

/* In the contract's own words - before VAT, as the terms of business state
   them - so the note on the lead reads the same as the paperwork. */
const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const say = {
  serviceLevel: (v: Figures["serviceLevel"]) => SERVICE_LEVELS.find((s) => s.id === v)?.label ?? "not set",
  feePct: (v: number | null) => (v == null ? "not set" : `${v}% + VAT`),
  setupFee: (v: number | null) => (v == null ? "not set" : v === 0 ? "none" : `${money(v)} + VAT`),
  otherFees: (v: string | null) => v ?? "none",
};
const LABEL: Record<keyof Figures, string> = {
  serviceLevel: "Service",
  feePct: "Management fee",
  setupFee: "Set-up fee",
  otherFees: "Other fees",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  /* Another agent's appraisal is closed to an agent (lib/appraisal-access, 26 Oct 2026). */
  const refused = await appraisalRefusal(req as NextRequest, id);
  if (refused) return refused;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  const [deck, terms] = await Promise.all([postDeckFor(ma), termsStateFor(ma)]);
  return NextResponse.json({
    ok: true,
    figures: figuresOf(ma),
    rent: ma.valuation ?? null,
    landlord: ma.landlord,
    deck: deck
      ? {
          token: deck.token,
          url: `${publicOrigin(req)}/present/${deck.token}`,
          figuresUpdatedAt: deck.deck.figuresUpdatedAt ?? null,
          opens: deck.opens,
        }
      : null,
    terms,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  /* Recorded against a person, so never while viewing as somebody else. */
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first. A change to the fees is recorded against whoever made it." }, { status: 401 });

  const { id } = await ctx.params;
  /* Another agent's appraisal is closed to an agent (lib/appraisal-access, 26 Oct 2026). */
  const refused = await appraisalRefusal(req as NextRequest, id);
  if (refused) return refused;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  /* Read strictly. "" means clear it; anything that will not parse is
     refused rather than quietly stored as something else - this is the fee a
     landlord is about to be asked to sign. */
  const num = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(String(v).replace(/[£,%\s]/g, "")));
  const fee = num(b.feePct);
  if (fee !== null && !(Number.isFinite(fee) && fee > 0 && fee <= 100)) {
    return NextResponse.json({ ok: false, field: "feePct", error: "The management fee is a percentage of the rent, between 0 and 100." }, { status: 400 });
  }
  const setup = num(b.setupFee);
  if (setup !== null && !(Number.isFinite(setup) && setup >= 0 && setup < 100000)) {
    return NextResponse.json({ ok: false, field: "setupFee", error: "Put the set-up fee in pounds, before VAT. 0 if there isn't one." }, { status: 400 });
  }
  const level = b.serviceLevel ? SERVICE_LEVELS.find((s) => s.id === b.serviceLevel)?.id ?? undefined : null;
  if (level === undefined) {
    return NextResponse.json({ ok: false, field: "serviceLevel", error: "Pick one of the services." }, { status: 400 });
  }
  const other = typeof b.otherFees === "string" ? b.otherFees.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 600) : "";

  const before = figuresOf(ma);
  const after: Figures = {
    serviceLevel: level,
    feePct: fee,
    /* Whole pounds: the column is an integer, as the set-up fee always was. */
    setupFee: setup == null ? null : Math.round(setup),
    /* "None" typed in is the same as nothing: the contract says None either way. */
    otherFees: other && !/^none\.?$/i.test(other) ? other : null,
  };
  const moved = (Object.keys(after) as (keyof Figures)[]).filter((k) => before[k] !== after[k]);
  if (!moved.length) {
    return NextResponse.json({ ok: false, error: "Nothing has changed, so there is nothing to save." }, { status: 400 });
  }

  const deck = await postDeckFor(ma);
  if (!deck) {
    return NextResponse.json(
      { ok: false, error: "There is no post-appraisal presentation on this file yet. Build it first - it will carry these figures." },
      { status: 409 }
    );
  }
  if (!ma.valuation) {
    return NextResponse.json({ ok: false, error: "Record the rent first. The fees sit beside it." }, { status: 409 });
  }

  try {
    const terms = await termsStateFor(ma);
    const who = actor.name || actor.email;

    /* 1. The record - what the terms are drawn up from. */
    const saved = await recordValuation(
      ma.id,
      { serviceLevel: after.serviceLevel, feePct: after.feePct, setupFee: after.setupFee, otherFees: after.otherFees },
      who
    );
    if (!saved) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
    if (before.serviceLevel !== after.serviceLevel) await followFile({ ...ma, serviceLevel: after.serviceLevel }, who);

    /* 2. The deck, behind the same link. */
    const row = await changeDeckFigures(deck.token, {
      serviceLevel: SERVICE_LEVELS.find((s) => s.id === after.serviceLevel)?.label ?? null,
      feePct: after.feePct,
      setupFee: after.setupFee,
      otherFees: after.otherFees,
    });

    /* What the agent has to do about the contract, said once here and again
       on the lead, so nobody has to remember it. */
    const termsLine = terms.signed
      ? `${ma.landlord} had already signed the terms on the old figures. Signed terms are never changed - new terms are needed if these figures stand.`
      : terms.sentAt
        ? `The terms sent to ${terms.sentTo ?? ma.landlord} carry the old figures, so they need drawing up again and signing, then a nudge to ${ma.landlord} so they sign the new ones. No nudge goes until then.`
        : terms.drawnUp
          ? "The terms already drawn up carry the old figures, so they need drawing up again before they go."
          : "The terms are not drawn up yet, so they will carry these figures.";

    /* 3. The record of the change, on the lead. */
    const changes = moved.map((k) => `${LABEL[k]}: ${say[k](before[k] as never)} → ${say[k](after[k] as never)}`);
    let noted = false;
    if (ma.leadId) {
      await addTouch({
        leadId: ma.leadId,
        kind: "note",
        outcome: null,
        body: [
          "Changed the fees on the post-appraisal presentation.",
          ...changes.map((c) => `${c}.`),
          reason ? `Why: ${reason}` : null,
          termsLine,
        ]
          .filter(Boolean)
          .join("\n"),
        byId: actor.id,
        byName: who,
      })
        .then(() => (noted = true))
        .catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      appraisal: saved,
      figures: figuresOf(saved),
      changes,
      deck: row
        ? { token: row.token, url: `${publicOrigin(req)}/present/${row.token}`, figuresUpdatedAt: row.deck.figuresUpdatedAt ?? null }
        : null,
      noted,
      terms,
      termsLine,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't save the new fees.") }, { status: 500 });
  }
}
