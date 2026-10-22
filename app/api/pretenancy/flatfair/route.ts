import { NextRequest, NextResponse } from "next/server";
import { resolveDealAccess } from "@/lib/business/deal-access";
import { getMeta, logSystemEvent, setChecklistItem } from "@/lib/business/deal-store";
import { PLATFORMS } from "@/lib/business/platforms";
import { flatbondForDeal, loadFlatbonds, type DealFlatbond } from "@/lib/business/flatfair-deal";
import { flatbondWords } from "@/lib/business/stage-evidence";
import { flatfairConfigured, flatfairEnv } from "@/lib/flatfair";
import { draftFor, sendDraft, type DraftFacts } from "@/lib/flatfair-draft";
import { switchOn } from "@/lib/switches";
import { can } from "@/lib/roles";
import { optOutFor, type OptOut } from "@/lib/zero-deposit-optout";

/**
 * The Flatfair hand-off, until Flatfair gives us an API.
 *
 * Kirstie (4 Sep): after the PLC check passes "the agents have to manually log
 * into Flatfair and add all the information in", and Flatfair pushes the
 * result back into Propoly. The API meeting is requested and not yet held. So
 * for now the OS does the next best thing: it puts every fact the Flatfair
 * form asks for on one screen, ready to copy, and records that it was done -
 * which is the part nobody records today, and the reason Kirstie checks.
 *
 * GET  ?deal=<uuid>  → the facts, and whether it has been ticked
 * POST { deal, done } → the tick. An agent may tick THIS item on their own
 *                       deal, which the general checklist route does not
 *                       allow: this is their step, and only they know when
 *                       they pressed submit on Flatfair.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ITEM = "deposit_registered";

function flatfairUrl(): string {
  return PLATFORMS.find((p) => p.id === "flatfair")?.url ?? "https://app.flatfair.co.uk";
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("deal") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which deal?" }, { status: 400 });
  const access = await resolveDealAccess(req, id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const app = access.deal.app;
  const p = app.propoly;
  const meta = await getMeta(id).catch(() => null);
  const tick = meta?.checklist?.[ITEM] ?? null;
  const landlordOptOut = await landlordOptOutOf(app);
  const held = await heldInFlatfair(access.deal);
  return NextResponse.json({
    ok: true,
    url: flatfairUrl(),
    deal: {
      id,
      property: [app.propertyName, app.locality].filter(Boolean).join(", "),
      rentPcm: app.offer,
      depositCap: p?.deposit ?? null,
      moveIn: app.startDate,
      service: p?.service ?? null,
      standingOrderRef: p?.standingOrderRef ?? null,
      flatfairClause: Boolean(p?.depositReplacement),
      /* Recorded on the landlord's file (21 Oct 2026): a cash deposit, never zero deposit. */
      landlordOptOut,
      tenants: app.tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone })),
      guarantors: p?.guarantors ?? [],
      landlord: p?.landlord ?? null,
      agent: access.deal.managerName,
    },
    done: tick?.done ? { by: tick.by, at: tick.at } : null,
    /* Sending it as a draft instead of copying it across (29 Sep 2026). */
    draftSend: {
      /* On Flatfair's test system it is for the owners to try, not agents mid-pilot. */
      available: flatfairConfigured() && (flatfairEnv() === "live" ? await switchOn("flatfair_drafts") : can(access.user.role, "see:wiring")),
      env: flatfairEnv(),
      sent: await draftFor(id),
      /* Flatfair already holds the tenancy, keyed in there by hand (22 Oct 2026:
         7 Caernarvon Close was in Flatfair, submitted, so never under Drafts). */
      held: held ? { id: held.id, words: flatbondWords(held) } : null,
    },
  });
}

/** The deal's flatbond in our copy of Flatfair, matched as the board matches it. */
async function heldInFlatfair(deal: Parameters<typeof flatbondForDeal>[0]): Promise<DealFlatbond | null> {
  return flatbondForDeal(deal, await loadFlatbonds().catch(() => []));
}

/** The deal's landlord, by the email Propoly holds, opted out of zero deposit? */
async function landlordOptOutOf(app: import("@/lib/business/rex-stats").AgentApplication): Promise<OptOut | null> {
  return optOutFor({ email: app.propoly?.landlord?.email ?? null }).catch(() => null);
}

function factsOf(dealId: string, app: import("@/lib/business/rex-stats").AgentApplication, landlordOptOut: OptOut | null): DraftFacts {
  const p = app.propoly;
  return {
    dealId,
    propertyName: app.propertyName,
    locality: app.locality,
    rentPcm: app.offer,
    deposit: p?.deposit ?? null,
    startDate: app.startDate,
    service: p?.service ?? null,
    /* Propoly puts its Flatfair clause on every deal; a landlord who opted
       out still gets a traditional deposit, never a zero deposit plan. */
    depositReplacement: Boolean(p?.depositReplacement) && !landlordOptOut,
    tenants: app.tenants.map((t) => ({ name: t.name ?? null, email: t.email ?? null, phone: t.phone ?? null })),
    guarantors: p?.guarantors ?? [],
    landlord: p?.landlord ?? null,
  };
}

export async function POST(req: NextRequest) {
  let body: { deal?: string; done?: boolean; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const id = body.deal ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which deal?" }, { status: 400 });
  const access = await resolveDealAccess(req, id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const byName = access.user.name || access.user.email;
  if (body.action === "draft") {
    if (flatfairEnv() !== "live" && !can(access.user.role, "see:wiring")) {
      return NextResponse.json({ ok: false, error: "Flatfair is on its test system; only the owners can try this for now." }, { status: 403 });
    }
    /* A second copy would email the tenants twice. */
    const held = flatfairEnv() === "live" ? await heldInFlatfair(access.deal) : null;
    if (held) {
      return NextResponse.json(
        { ok: false, error: `Flatfair already holds this tenancy (flatbond ${held.id}). ${flatbondWords(held)}` },
        { status: 409 }
      );
    }
    const out = await sendDraft(factsOf(id, access.deal.app, await landlordOptOutOf(access.deal.app)), { id: access.user.id, name: access.user.name ?? "", email: access.user.email });
    if (out.ok) {
      await logSystemEvent(
        id,
        { id: access.user.id, name: byName, role: access.role },
        `sent the deal to Flatfair as draft ${out.draft.draftId}${out.draft.test ? " (Flatfair's test system)" : ""}`
      ).catch(() => undefined);
    }
    return NextResponse.json(out, { status: out.ok ? 200 : 400 });
  }
  const done = body.done !== false;
  await setChecklistItem(id, ITEM, done, byName);
  await logSystemEvent(
    id,
    { id: access.user.id, name: byName, role: access.role },
    done ? "set the deal up in Flatfair" : "unticked the Flatfair set-up"
  ).catch(() => undefined);
  const meta = await getMeta(id).catch(() => null);
  const tick = meta?.checklist?.[ITEM] ?? null;
  return NextResponse.json({ ok: true, done: tick?.done ? { by: tick.by, at: tick.at } : null });
}
