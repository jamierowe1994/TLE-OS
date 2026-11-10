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
import { letPeople, tenantsAsOnLet, type EditedPart } from "@/lib/let-people";
import { letForDeal, samePerson } from "@/lib/let-deal";
import type { BusinessDeal } from "@/lib/business/propoly-deals";
import type { OsUser } from "@/lib/users";

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
  const people = await peopleOf(access.deal, access.user);
  const landlordOptOut = await landlordOptOutOf(app, people.landlord);
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
      tenants: people.tenants,
      guarantors: p?.guarantors ?? [],
      landlord: people.landlord,
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

/** The deal's landlord, by the let's landlord's email (else the one Propoly holds), opted out of zero deposit? */
async function landlordOptOutOf(app: import("@/lib/business/rex-stats").AgentApplication, landlord: Person | null): Promise<OptOut | null> {
  return optOutFor({ email: landlord?.email ?? app.propoly?.landlord?.email ?? null }).catch(() => null);
}

type Person = { name: string | null; email: string | null; phone: string | null };

const pick = (t: Person): Person => ({ name: t.name ?? null, email: t.email ?? null, phone: t.phone ?? null });

/**
 * The tenants and the landlord with the let's corrections (4 Nov 2026), for
 * the screen and the draft alike. The draft sent Propoly's own copy of the
 * deal: an email put right on the let still went to the old address, somebody
 * added on the let was left off, and a landlord changed in the OS was not the
 * one named. A tenancy can have two let pages - the application's, which
 * finds the deal, and the deal opened as a let from the pre-tenancy board -
 * and a correction is kept under whichever it was made on, so both are read
 * (the application from lib/let-deal letForDeal):
 *
 *   tenants    Propoly's, the lead as Propoly has them, each with what was put
 *              right on either let (lib/let-people tenantsAsOnLet: only the
 *              parts changed, the newer where both were), then anybody added
 *              on either.
 *   landlord   Propoly's, unless the landlord was changed in the OS, or it is
 *              the deal's own landlord with details put right on its let. The
 *              listing's owner is not swapped in for the one on the deal.
 *
 * Nothing found or read, Propoly's copy as before.
 */
async function peopleOf(deal: BusinessDeal, user: OsUser): Promise<{ tenants: Person[]; landlord: Person | null }> {
  const app = deal.app;
  const theirs = { tenants: app.tenants.map(pick), landlord: app.propoly?.landlord ? pick(app.propoly.landlord) : null };
  const link = await letForDeal(deal).catch(() => ({ ref: app.id, app: null }));
  const viaApp = link.app && link.ref !== app.id ? link.app : null;
  /* Each let's own list, as tenantsAsOnLet keys it: the deal's people, and the application's. */
  type Own = { name: string; email: string | null; phone: string | null; contactId: string | null };
  type Read = Own & { editedOnLet?: EditedPart[]; editedAt?: string };
  const added = (t: { name: string; email: string | null; phone: string | null }): Own => ({ name: t.name, email: t.email, phone: t.phone, contactId: null });
  const dealOwn: Own[] = app.tenants.map((t) => ({ name: t.name ?? "", email: t.email ?? null, phone: t.phone ?? null, contactId: null }));
  const appOwn: Own[] = (viaApp?.applicants ?? []).map((t) => ({ name: t.name ?? "", email: t.email ?? null, phone: t.phone ?? null, contactId: t.contactId ?? null }));
  const [onDeal, onApp] = await Promise.all([
    tenantsAsOnLet(app.id, dealOwn, { source: "propoly", added }).catch((): Read[] => dealOwn),
    viaApp ? tenantsAsOnLet(link.ref, appOwn, { added }).catch((): Read[] => appOwn) : Promise.resolve([] as Read[]),
  ]);
  /* Oldest correction first, so the newer is the one left standing. */
  const putRight = (d: Person, reads: Array<Read | undefined>): Person => {
    const out = { ...d };
    for (const c of reads.filter((x): x is Read => Boolean(x?.editedOnLet?.length)).sort((a, b) => (a.editedAt ?? "").localeCompare(b.editedAt ?? ""))) {
      for (const p of c.editedOnLet ?? []) out[p] = c[p];
    }
    return out;
  };
  const tenants = theirs.tenants.map((d, i) => putRight(d, [onDeal[i], onApp[appOwn.findIndex((o) => samePerson(o, d))]]));
  for (const a of [...onDeal.slice(dealOwn.length), ...onApp.slice(appOwn.length)]) if (!tenants.some((t) => samePerson(t, a))) tenants.push(pick(a));

  const [dealLet, appLet] = await Promise.all([letPeople(app.id, user).catch(() => null), viaApp ? letPeople(link.ref, user).catch(() => null) : Promise.resolve(null)]);
  const leadOf = (r: typeof dealLet) => (r?.ok ? r.let.people.find((x) => x.role === "landlord" && x.isPrimary) ?? null : null);
  const changed = [leadOf(appLet), leadOf(dealLet)].find((x) => x?.source === "changed") ?? null;
  const dealLead = leadOf(dealLet);
  const theirsPutRight =
    dealLead?.source === "propoly" && dealLet?.ok && dealLet.let.landlord && theirs.landlord && samePerson(dealLet.let.landlord, theirs.landlord) ? dealLead : null;
  const lead = changed ?? theirsPutRight;
  if (!lead) return { tenants, landlord: theirs.landlord };
  /* An email or mobile the let hasn't got is Propoly's for the same person, never another's. */
  const same = theirs.landlord && samePerson(lead, theirs.landlord) ? theirs.landlord : null;
  return { tenants, landlord: { name: lead.name, email: lead.email || same?.email || null, phone: lead.phone || same?.phone || null } };
}

function factsOf(dealId: string, app: import("@/lib/business/rex-stats").AgentApplication, landlordOptOut: OptOut | null, people: { tenants: Person[]; landlord: Person | null }, agentName: string | null): DraftFacts {
  const p = app.propoly;
  return {
    dealId,
    agentName,
    propertyName: app.propertyName,
    locality: app.locality,
    rentPcm: app.offer,
    deposit: p?.deposit ?? null,
    startDate: app.startDate,
    service: p?.service ?? null,
    /* Propoly puts its Flatfair clause on every deal; a landlord who opted
       out still gets a traditional deposit, never a zero deposit plan. */
    depositReplacement: Boolean(p?.depositReplacement) && !landlordOptOut,
    tenants: people.tenants,
    guarantors: p?.guarantors ?? [],
    landlord: people.landlord,
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
    const people = await peopleOf(access.deal, access.user);
    const out = await sendDraft(factsOf(id, access.deal.app, await landlordOptOutOf(access.deal.app, people.landlord), people, access.deal.managerName ?? null), { id: access.user.id, name: access.user.name ?? "", email: access.user.email });
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
