import "server-only";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { rexCall, rexConfigured, rexRows, rexWritesLocked, isExpiredToken, type RexResponse } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { OS_TAG } from "@/lib/rex-contacts";
import { createProperty } from "@/lib/rex-properties";
import { TEST_STREET } from "@/lib/test-guard";
import { propolyConfigured, propolyGet, propolyPatch, propolyPost } from "@/lib/business/propoly";
import { getAllPropolyDeals, refreshPropolyDealsNow } from "@/lib/business/propoly-deals";
import { candidateOf, firstMatch, landlordPayload, listOf, propolyUserFor, refusal, ukMobile, type PropertyCandidate } from "@/lib/handover";
import { DEPOSIT_SCHEMES, SCOTTISH_SCHEME, TENANCY_TYPES, dealPayload, dealProblems, officeScheme, type DealTerms } from "@/lib/handover-deal";
import { isScottish } from "@/lib/property-flags";
import { isHmoLet, type LetType } from "@/lib/let-type";
import { parseAddress, sameHome } from "@/lib/address-parse";
import { claimPush, getTakeOn, savePush, type TakeOn, type TakeOnPush, type TakeOnPushStep, type TakeOnPushSystem } from "@/lib/take-ons";

/**
 * A TAKE-ON, PUSHED (19 Oct 2026; Dan Richards' ticket a9f80822).
 *
 * A management transfer is saved in the OS (lib/take-ons). These are the two
 * pushes that follow it, each behind its own switch and rehearsed while that
 * switch is off - the pattern lib/handover set: live reads, nothing written,
 * every step recorded as what it WOULD do, with the exact payload.
 *
 *   Send to Propoly (take_on_propoly)
 *     1. the landlord: found by email, else created
 *     2. the home: the uuid REX holds on its listing, else matched by postcode
 *        and door, else created under the agent who took it on. Short of a
 *        sure match with close ones about, a live run stops and asks
 *     3. the landlord related to the home
 *     4. the deal: an open one on the home is used, never a second; else one
 *        from the take-over date at the current rent, no holding fee
 *     5. each sitting tenant on the deal, referenced only where ticked
 *
 *   Add to the listing system (take_on_rex)
 *     1. the landlord as a contact: found by email, else created and tagged
 *     2. the home: left alone when REX holds it; else created with the
 *        landlord as owner (lib/rex-properties, so its own switch and the
 *        test-file and duplicate checks still apply)
 *     3. each tenant as a contact: found by email, else created and tagged
 *
 * The office presses them (the route checks), never an agent. The last run of
 * each is kept on the take-on with the ids it made, so a second press reuses
 * them rather than making a second landlord, home or deal. A step this does
 * not do is said, not skipped silently.
 *
 * Agent screens never say "REX": every label and detail written here for the
 * REX push says "the listing system". REX's own refusal is kept as `reason`.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const norm = (v: unknown) => (str(v) ?? "").toLowerCase().replace(/\s+/g, "");
const now = () => new Date().toISOString();
const MAX_PROPERTY_PAGES = 60;
const CLOSED_DEAL = new Set(["complete", "cancelled", "archived"]);

class Run {
  push: TakeOnPush;
  constructor(
    private takeOnId: string,
    system: TakeOnPushSystem,
    public live: boolean,
    by: string,
    ids: Record<string, string>
  ) {
    this.push = { system, mode: live ? "live" : "rehearsal", status: "running", steps: [], ids: { ...ids }, by, at: now(), finishedAt: null };
  }
  async add(step: Omit<TakeOnPushStep, "at">) {
    /* The take-on page is an agent screen: REX is "the listing system" there,
       even inside REX's own refusal and the write lock's wording. */
    if (this.push.system === "rex") {
      const plain = (v: string) => v.replace(/\bREX(_ALLOW_WRITES)?\b/g, (_m, lock) => (lock ? "the write list" : "the listing system"));
      step = { ...step, detail: plain(step.detail), reason: step.reason ? plain(step.reason) : step.reason };
    }
    this.push.steps.push({ ...step, at: now() });
    await savePush(this.takeOnId, this.push.system, this.push).catch(() => {});
  }
  /** "done" for real, "would" in a rehearsal: the same step, two verbs. */
  get doneOrWould(): "done" | "would" {
    return this.live ? "done" : "would";
  }
  async finish() {
    const states = this.push.steps.map((s) => s.state);
    this.push.status = states.includes("failed") ? "failed" : states.includes("blocked") ? "blocked" : this.live ? "done" : "would";
    this.push.finishedAt = now();
    await savePush(this.takeOnId, this.push.system, this.push).catch(() => {});
  }
}

export interface PushOptions {
  /** The person pressing it: their name on the run, their REX sign-in for a REX write. */
  by: string;
  byUserId: string | null;
  byEmail: string | null;
  /** The office has said this home is new to Propoly, despite close matches. */
  newProperty?: boolean;
  /** Rehearse whatever the switch says. Only ever narrows: never live with the switch off. */
  rehearse?: boolean;
}

export async function takeOnPushLive(system: TakeOnPushSystem): Promise<boolean> {
  return switchOn(system === "propoly" ? "take_on_propoly" : "take_on_rex").catch(() => false);
}

/** Run one push. Throws only when it cannot start (already running, no such take-on). */
export async function pushTakeOn(id: string, system: TakeOnPushSystem, opts: PushOptions): Promise<TakeOn> {
  if (!hasDb()) throw new Error("No database on this environment, so a push has nowhere to be recorded.");
  const t = await getTakeOn(id);
  if (!t) throw new Error("That take-on isn't here.");
  const live = !opts.rehearse && (await takeOnPushLive(system));
  /* Ids carry forward from run to run, rehearsals included: only a live run
     ever adds one, so a rehearsal after a live push keeps what it made. */
  const prior = system === "propoly" ? t.propolyPush : t.rexPush;
  const ids = prior?.ids ?? {};
  const run = new Run(t.id, system, live, opts.by, ids);
  if (!(await claimPush(t.id, system, run.push))) throw new Error("This push is already running. Give it a minute and open the take-on again.");
  try {
    if (TEST_STREET.test(`${t.line1} ${t.town}`)) {
      await run.add({ id: "test", label: "Test file", state: "skipped", detail: "This is a test address, so it stays in the OS and is never sent." });
    } else if (system === "propoly") {
      await toPropoly(t, run, opts);
    } else {
      await toRex(t, run, opts);
    }
  } catch (e) {
    await run.add({ id: "error", label: "The push stopped", state: "failed", detail: "Something went wrong part way. The steps above say how far it got.", reason: (e as Error)?.message ?? String(e) });
  }
  await run.finish();
  return (await getTakeOn(t.id)) ?? t;
}

/* ── Propoly ──────────────────────────────────────────────────────────────── */

function splitName(name: string): { first: string; last: string } {
  const whole = name.trim().split(/\s+/);
  return { first: whole.length > 1 ? whole.slice(0, -1).join(" ") : whole[0] ?? "", last: whole.length > 1 ? whole[whole.length - 1] : "" };
}

/** Whole months from the take-over to a fixed term's end; 12 when it rolls. */
function termMonthsOf(t: TakeOn): number {
  if (t.tenancy.periodic || !t.tenancy.endsOn) return 12;
  const a = new Date(`${t.takeoverOn}T12:00:00Z`);
  const b = new Date(`${t.tenancy.endsOn}T12:00:00Z`);
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return Math.max(1, Math.min(60, months));
}

/**
 * The deal a take-on starts. Behind the switch, the safest reading of a
 * mid-tenancy transfer until James says otherwise (his questions, in the
 * commit): it starts on the take-over date, at the rent the tenants pay now,
 * with no holding fee (nobody is reserving a home they live in), on the
 * template and tenancy type a new let in that country gets.
 */
export function takeOnDealTerms(t: TakeOn): DealTerms {
  const scotland = isScottish(t.postcode, t.town, t.line1);
  const hmo = isHmoLet(t.letType as LetType);
  return {
    rentPcm: t.tenancy.rentPcm,
    moveIn: t.takeoverOn,
    termMonths: termMonthsOf(t),
    template: scotland ? (hmo ? "Propoly HMO Scotland Lease" : "Propoly Scotland Lease") : "Standard Propoly APT",
    serviceLevel: t.service === "rent_collect" ? "rent_collect" : "full_managed",
    paymentSchedule: "monthly",
    tenancyType: scotland ? "scottish_tenancy" : "assured_periodic_tenancy",
    depositScheme: scotland ? SCOTTISH_SCHEME : officeScheme() ?? "tds_custodial",
    zeroDeposit: false,
    depositPounds: t.tenancy.depositHeld === "none" ? 0 : t.tenancy.depositPounds,
    /* Nobody is reserving a home they already live in. Propoly ignores a
       fee of 0 on a new deal (the tenant swaps showed it), so the deal check
       below says when it has put one on. */
    holdingFeePounds: 0,
    scotland,
  };
}

const pounds = (p: number | null | undefined) => (p == null ? "none" : `£${p.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);
const dayOf = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "no date";
const termWords = (d: DealTerms) =>
  [`${pounds(d.rentPcm)} a month`, `from ${dayOf(d.moveIn)}`, `${d.termMonths} months`, d.template, TENANCY_TYPES[d.tenancyType], d.depositScheme ? DEPOSIT_SCHEMES[d.depositScheme] : "no scheme", `deposit ${pounds(d.depositPounds)}`, "no holding fee"].join(", ");

async function readDeal(uuid: string): Promise<Row | null> {
  const res = await propolyGet(`/api/v1/deals/${encodeURIComponent(uuid)}`);
  if (res.status < 200 || res.status >= 300) return null;
  const b = (res.body ?? {}) as Row;
  return ((b.deal as Row | undefined) ?? b) as Row;
}
const ok2xx = (s: number) => s >= 200 && s < 300;
const uuidIn = (body: unknown, key: string) => str(((body as Row | null)?.[key] as Row | null)?.uuid) ?? str((body as Row | null)?.uuid) ?? str(((body as Row | null)?.data as Row | null)?.uuid);

async function toPropoly(t: TakeOn, run: Run, opts: PushOptions) {
  const live = run.live;
  const ids = run.push.ids;
  if (!propolyConfigured()) {
    await run.add({ id: "propoly", label: "Propoly", state: "failed", detail: "Propoly is not connected on this environment." });
    return;
  }

  /* 1. The landlord. Propoly finds landlords by email, lower case. */
  const email = (t.landlord.email ?? "").trim().toLowerCase();
  const llLabel = `Landlord: ${t.landlord.name}`;
  if (ids.landlord) {
    await run.add({ id: "landlord", label: llLabel, state: "done", detail: "Already in Propoly from an earlier push." });
  } else if (!email) {
    await run.add({ id: "landlord", label: llLabel, state: "blocked", detail: "No email for the landlord, and Propoly finds landlords by email. Add it to the take-on's landlord and press again." });
  } else {
    const found = await propolyGet(`/api/v1/landlords?email=${encodeURIComponent(email)}&page=1&per_page=10`);
    if (found.status === 0 || found.status >= 400) {
      await run.add({ id: "landlord", label: llLabel, state: "blocked", detail: "Propoly couldn't be asked whether this landlord is already there, so nothing was made. Try again in a few minutes.", reason: refusal(found) });
    } else {
      const hit = firstMatch(found.body, (l) => norm(l.email) === norm(email));
      const uuid = hit ? str(hit.uuid ?? hit.id) : null;
      if (uuid) {
        if (live) ids.landlord = uuid;
        await run.add({ id: "landlord", label: llLabel, state: "done", detail: "Already in Propoly, so it is used, not doubled." });
      } else {
        const { first, last } = splitName(t.landlord.name);
        const payload = { landlord: landlordPayload({ first_name: first, last_name: last, phone_number: t.landlord.phone ?? "" }, t.landlord.name, email) };
        if (!live) {
          await run.add({ id: "landlord", label: llLabel, state: "would", detail: "Not in Propoly. Would create them with these details.", request: payload });
        } else {
          const made = await propolyPost("/api/v1/landlords", payload);
          const made_uuid = uuidIn(made.body, "landlord");
          if (ok2xx(made.status) && made_uuid) {
            ids.landlord = made_uuid;
            await run.add({ id: "landlord", label: llLabel, state: "done", detail: "Created in Propoly.", request: payload });
          } else {
            await run.add({ id: "landlord", label: llLabel, state: "failed", detail: "Propoly said no.", reason: refusal(made), request: payload });
          }
        }
      }
    }
  }

  /* 2. The home. Looked for before anything is made: today agents key a
     take-on into Propoly by hand, so it may well be there already. */
  const address = [t.line1, t.town, t.postcode].filter(Boolean).join(", ");
  let propertyUuid: string | null = ids.property ?? null;
  let propertyFrom = propertyUuid ? "From an earlier push." : "";
  if (!propertyUuid && /^\d+$/.test(t.homeRef)) {
    const cf = await rexCall("CustomFields", "getValuesKeyedByFieldName", { service_name: "Listings", service_object_id: t.homeRef }).catch(() => null);
    const uuid = str((((cf?.ok ? cf.result : null) ?? {}) as Row)["api.propolyPropertyUUID"]);
    if (uuid) {
      propertyUuid = uuid;
      propertyFrom = "The listing system already holds this home's Propoly record.";
    }
  }
  const candidates: PropertyCandidate[] = [];
  let unknown = false;
  if (!propertyUuid) {
    const ours = `${t.line1}, ${t.postcode}`;
    const oursParsed = parseAddress(ours);
    for (let page = 1; page <= MAX_PROPERTY_PAGES && !propertyUuid; page++) {
      const res = await propolyGet(`/api/v1/properties?page=${page}&per_page=25`);
      if (res.status >= 400 || res.status === 0) {
        unknown = true;
        await run.add({ id: "property", label: "The home in Propoly", state: live ? "blocked" : "would", detail: `Propoly would not list its properties (page ${page}), so it isn't known whether this home is already there. Nothing was made. Try again in a few minutes.`, reason: refusal(res) });
        break;
      }
      const items = listOf(res.body);
      if (!items.length) break;
      for (const p of items) {
        const c = candidateOf(p);
        if (!c.uuid) continue;
        const samePostcode = Boolean(t.postcode) && norm(c.postcode) === norm(t.postcode);
        if ((samePostcode && norm(p.address_line1) === norm(t.line1)) || (samePostcode && sameHome(ours, `${c.address}, ${c.postcode}`))) {
          propertyUuid = c.uuid;
          propertyFrom = `Matched in Propoly on postcode and door: ${c.address}.`;
          break;
        }
        const theirs = parseAddress(c.address);
        const sameBuilding = Boolean(oursParsed.street) && theirs.street === oursParsed.street && oursParsed.building != null && theirs.building === oursParsed.building;
        if ((samePostcode || sameBuilding) && candidates.length < 8) candidates.push(c);
      }
      if (items.length < 25) break;
    }
  }
  const managerEmail = t.byEmail ?? opts.byEmail;
  if (propertyUuid) {
    if (live) ids.property = propertyUuid;
    await run.add({ id: "property", label: "The home in Propoly", state: "done", detail: `${propertyFrom} Used as it is, so nothing is doubled.` });
  } else if (!unknown) {
    if (candidates.length && !opts.newProperty) {
      await run.add({
        id: "property",
        label: "The home in Propoly",
        state: live ? "blocked" : "would",
        detail: `Not sure this home is in Propoly yet: ${candidates.length} close match${candidates.length === 1 ? "" : "es"} (${candidates.map((c) => `${c.address} ${c.postcode}`.trim()).join("; ")}). If none of them is it, press again and say it's new.`,
        request: { candidates },
      });
    } else {
      const managedBy = await propolyUserFor(managerEmail);
      const noGas = t.osPropertyId
        ? Boolean((await q<{ no_gas: boolean }>(`SELECT no_gas FROM os_properties WHERE id = $1`, [t.osPropertyId]).catch(() => []))[0]?.no_gas)
        : false;
      const payload = {
        property: {
          managed_by_user_id: managedBy,
          address_line1: t.line1,
          address_line2: "",
          town: t.town,
          county: "",
          district: "",
          postcode: t.postcode,
          rent_type: "entire_property",
          number_of_bedrooms: t.bedrooms ?? 0,
          gas: !noGas,
        },
      };
      if (!managedBy) {
        await run.add({ id: "property", label: "The home in Propoly", state: "blocked", detail: `Not in Propoly, and nobody in Propoly matches ${managerEmail ?? "the agent who took it on"}, so it has nobody to be made under.`, request: payload });
      } else if (!live) {
        await run.add({ id: "property", label: "The home in Propoly", state: "would", detail: `Not in Propoly. Would create it under ${managerEmail}.`, request: payload });
      } else {
        const made = await propolyPost("/api/v1/properties", payload);
        const uuid = uuidIn(made.body, "property");
        if (ok2xx(made.status) && uuid) {
          propertyUuid = uuid;
          ids.property = uuid;
          await run.add({ id: "property", label: "The home in Propoly", state: "done", detail: `Created in Propoly under ${managerEmail}.`, request: payload });
        } else {
          await run.add({ id: "property", label: "The home in Propoly", state: "failed", detail: "Propoly said no.", reason: refusal(made), request: payload });
        }
      }
    }
  }

  /* 3. The landlord related to the home. A 409 "already associated" is the answer we want. */
  const landlordUuid = ids.landlord ?? null;
  const relPayload = { associated_type: "Property", associated_uuid: propertyUuid };
  if (!live) {
    await run.add({ id: "relationship", label: "Landlord and home joined", state: "would", detail: "Would join the landlord to the home, so they come onto the deal with it.", request: relPayload });
  } else if (!landlordUuid || !propertyUuid) {
    await run.add({ id: "relationship", label: "Landlord and home joined", state: "skipped", detail: "Not done: the landlord or the home isn't in Propoly yet (see above)." });
  } else {
    const isAlready = (status: number, body: unknown) => status === 409 || /already associated/i.test(refusal({ status, body }));
    const res = await propolyPatch(`/api/v1/landlords/${encodeURIComponent(landlordUuid)}/relationships`, relPayload, { expected: isAlready });
    const already = isAlready(res.status, res.body);
    await run.add(
      ok2xx(res.status) || already
        ? { id: "relationship", label: "Landlord and home joined", state: "done", detail: already ? "Already joined." : "Joined." }
        : { id: "relationship", label: "Landlord and home joined", state: "failed", detail: "Propoly said no.", reason: refusal(res), request: relPayload }
    );
  }

  /* 4. The deal. Never two: one an earlier push started, else one open on the home. */
  const terms = takeOnDealTerms(t);
  let dealUuid: string | null = ids.deal ?? null;
  let dealFrom = dealUuid ? "Started by an earlier push; used again, not doubled." : "";
  if (!dealUuid && propertyUuid) {
    if (live) await refreshPropolyDealsNow().catch(() => null);
    const deals = await getAllPropolyDeals().catch(() => null);
    if (!deals) {
      await run.add({ id: "deal", label: "The deal in Propoly", state: live ? "blocked" : "would", detail: "Propoly's deals couldn't be read, so it isn't known whether this home already has one. No deal was started. Try again in a few minutes." });
      return;
    }
    const open = deals
      .filter((d) => d.app.propoly?.propertyUuid === propertyUuid && !CLOSED_DEAL.has(d.statusKey))
      .sort((a, b) => (b.app.dateReceived ?? "").localeCompare(a.app.dateReceived ?? ""));
    if (open[0]) {
      dealUuid = open[0].app.id;
      dealFrom = `Propoly already has an open deal on this home (started ${dayOf(open[0].app.dateReceived)}), so that one is used, not doubled.`;
    }
  }
  if (dealUuid) {
    if (live) ids.deal = dealUuid;
    await run.add({ id: "deal", label: "The deal in Propoly", state: "done", detail: dealFrom });
  } else {
    const problems = dealProblems(terms);
    if (problems.length) {
      await run.add({ id: "deal", label: "The deal in Propoly", state: live ? "blocked" : "would", detail: `The deal can't be started yet: ${problems.join(" ")} Add it to the take-on and press again.`, request: { terms } });
      return;
    }
    const managedBy = await propolyUserFor(managerEmail);
    const payload = managedBy && propertyUuid ? dealPayload(terms, propertyUuid, managedBy) : { terms };
    if (!live) {
      await run.add({ id: "deal", label: "The deal in Propoly", state: "would", detail: `Would start the deal: ${termWords(terms)}.${managedBy ? "" : ` Nobody in Propoly matches ${managerEmail ?? "the agent"}, which would stop it.`}`, request: payload });
    } else if (!propertyUuid) {
      await run.add({ id: "deal", label: "The deal in Propoly", state: "skipped", detail: "Not started: the home isn't in Propoly yet (see above)." });
      return;
    } else if (!managedBy) {
      await run.add({ id: "deal", label: "The deal in Propoly", state: "blocked", detail: `Nobody in Propoly matches ${managerEmail ?? "the agent who took it on"}, so the deal has nobody to manage it.`, request: { terms } });
      return;
    } else {
      const made = await propolyPost("/api/v1/deals", payload);
      const uuid = uuidIn(made.body, "deal");
      if (!ok2xx(made.status)) {
        await run.add({ id: "deal", label: "The deal in Propoly", state: "failed", detail: "Propoly said no. Nothing was started.", reason: refusal(made), request: payload });
        return;
      }
      if (!uuid) {
        await run.add({ id: "deal", label: "The deal in Propoly", state: "failed", detail: "Propoly says it started the deal but didn't say which, so the tenants couldn't be added. Check Propoly; pressing again uses the open deal rather than starting another.", request: payload });
        return;
      }
      dealUuid = uuid;
      ids.deal = uuid;
      await run.add({ id: "deal", label: "The deal in Propoly", state: "done", detail: `Started: ${termWords(terms)}.`, request: payload });
    }
  }

  /* 5. The sitting tenants, the ones the deal hasn't got. */
  const before = live && dealUuid ? await readDeal(dealUuid) : null;
  const have = new Set(((before?.tenants ?? []) as Row[]).map((x) => norm(x.email ?? x.user_email ?? (x.user_details as Row | null)?.email)).filter(Boolean));
  for (const [i, x] of t.tenants.entries()) {
    const sid = `tenant:${i}`;
    const label = `Tenant: ${x.name}`;
    const refWords = x.reference ? "referenced" : "not referenced";
    if (!x.email) {
      await run.add({ id: sid, label, state: "blocked", detail: "No email address, and Propoly needs one. Add it to the take-on and press again, or add them in Propoly." });
      continue;
    }
    if (have.has(norm(x.email))) {
      await run.add({ id: sid, label, state: "done", detail: "Already on the deal." });
      continue;
    }
    const { first, last } = splitName(x.name);
    const payload = {
      deal_id: dealUuid,
      deal_uuid: dealUuid,
      tenant: {
        user_attributes: { email: x.email.toLowerCase(), title: "Mx", first_name: first, last_name: last, mobileno: ukMobile(x.phone) },
        reference_required: x.reference === true,
      },
    };
    if (!live) {
      await run.add({ id: sid, label, state: "would", detail: `Would add them to the deal, ${refWords}.`, request: payload });
      continue;
    }
    if (!dealUuid) {
      await run.add({ id: sid, label, state: "skipped", detail: "Not added: there is no deal yet (see above)." });
      continue;
    }
    const res = await propolyPost("/api/v1/tenants", payload);
    await run.add(
      ok2xx(res.status)
        ? { id: sid, label, state: "done", detail: `Added to the deal, ${refWords}.` }
        : { id: sid, label, state: "failed", detail: "Propoly said no. Add them in Propoly, or fix it and press again.", reason: refusal(res), request: payload }
    );
  }

  /* 6. What Propoly holds now, in its own figures. */
  if (live && dealUuid) {
    const after = await readDeal(dealUuid);
    if (after) {
      const tm = (after.terms ?? {}) as Row;
      const p = (v: unknown) => (typeof v === "number" ? v / 100 : null);
      const notes: string[] = [];
      if (p(tm.holding_fee_pence)) notes.push(`Propoly put a holding fee of ${pounds(p(tm.holding_fee_pence))} on it. A take-on has none: set it to not required in Propoly or the deal waits at the start`);
      if (!((after.landlords ?? []) as Row[]).length) notes.push("no landlord is on the deal");
      await run.add({
        id: "deal-check",
        label: "The deal as Propoly holds it",
        state: "done",
        detail: `${pounds(p(tm.price_pcm_pence))} a month from ${dayOf(str(tm.move_in_date))}, ${((after.tenants ?? []) as Row[]).length} tenant(s).${notes.length ? ` Check in Propoly: ${notes.join("; ")}.` : ""}`,
      });
    }
    void refreshPropolyDealsNow().catch(() => null);
  }
}

/* ── REX ("the listing system") ───────────────────────────────────────────── */

const LS = "the listing system";

/** "Flat 2, 14 Mill Lane" → unit "Flat 2", number "14", street "Mill Lane". A house name stands in for the number. */
export function splitLine1(line1: string): { unitNumber: string | null; streetNumber: string; streetName: string } {
  const parts = line1.split(",").map((x) => x.trim()).filter(Boolean);
  let unit: string | null = null;
  if (parts.length > 1 && /^(flat|apartment|apt|unit|room|studio)\b/i.test(parts[0])) unit = parts.shift() as string;
  const rest = parts.join(", ");
  const m = rest.match(/^(\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?)\s+(.+)$/i);
  if (m) return { unitNumber: unit, streetNumber: m[1], streetName: m[2] };
  if (parts.length > 1) return { unitNumber: unit, streetNumber: parts[0], streetName: parts.slice(1).join(", ") };
  return { unitNumber: unit, streetNumber: "", streetName: rest };
}

function contactPayload(name: string, email: string | null, phone: string | null): Row {
  const { first, last } = splitName(name);
  const related: Row = { contact_names: [{ name_first: first || name, name_last: last }], contact_tags: [{ tag: OS_TAG }] };
  if (email) related.contact_emails = [{ email_address: email, email_desc: "Default", email_primary: true }];
  if (phone) related.contact_phones = [{ phone_type: "Mob", phone_number: phone, phone_primary: true, phone_primary_sms: true }];
  return { type: "person", name_first: first || name, name_last: last, ...(email ? { email_address: email } : {}), ...(phone ? { phone_number: phone } : {}), related };
}

const idOf = (raw: unknown) => (typeof raw === "number" || typeof raw === "string" ? String(raw) : String((raw as { id?: unknown } | null)?.id ?? ""));

/** One person as a contact: found by email, else made (live) or would be. Returns the id when there is one. */
async function contactStep(
  run: Run,
  token: string | null,
  step: { id: string; label: string; idKey: string; name: string; email: string | null; phone: string | null }
): Promise<string | null> {
  const ids = run.push.ids;
  if (ids[step.idKey]) {
    await run.add({ id: step.id, label: step.label, state: "done", detail: `Already in ${LS} from an earlier push.` });
    return ids[step.idKey];
  }
  const email = (step.email ?? "").trim().toLowerCase() || null;
  if (!email) {
    await run.add({ id: step.id, label: step.label, state: "skipped", detail: `No email, so they can't be checked against ${LS}'s people and nobody is made twice. Add them there by hand, or add an email to the take-on and press again.` });
    return null;
  }
  const found = await rexCall("Contacts", "search", { criteria: [{ name: "contact.email_address", type: "=", value: email }], limit: 5 }).catch(() => null);
  if (!found?.ok) {
    await run.add({ id: step.id, label: step.label, state: "blocked", detail: `${LS[0].toUpperCase()}${LS.slice(1)} couldn't be searched, so it isn't known whether they are already there. Nothing was made. Try again in a few minutes.`, reason: found?.error ?? null });
    return null;
  }
  const hit = rexRows(found.result).find((r) => norm(r.email_address) === norm(email)) ?? rexRows(found.result)[0];
  if (hit && idOf(hit)) {
    if (run.live) ids[step.idKey] = idOf(hit);
    await run.add({ id: step.id, label: step.label, state: "done", detail: `Already in ${LS} (contact ${idOf(hit)}), so they are used, not doubled.` });
    return idOf(hit);
  }
  const payload = contactPayload(step.name, email, step.phone);
  if (!run.live) {
    await run.add({ id: step.id, label: step.label, state: "would", detail: `Not in ${LS}. Would add them, tagged "${OS_TAG}".`, request: payload });
    return null;
  }
  if (rexWritesLocked("Contacts", "create")) {
    await run.add({ id: step.id, label: step.label, state: "blocked", detail: `Adding people to ${LS} isn't unlocked on this environment yet (Contacts/create is not on the write list).`, request: payload });
    return null;
  }
  const res: RexResponse = await rexCall("Contacts", "create", { data: payload, return_id: true }, token).catch((e: Error) => ({ ok: false, error: e.message, result: null, status: 0 }));
  if (isExpiredToken(res)) {
    await run.add({ id: step.id, label: step.label, state: "blocked", detail: `Your sign-in to ${LS} has run out. Sign in again on Profile and press again.` });
    return null;
  }
  const id = res.ok ? idOf(res.result) : "";
  if (!res.ok || !id) {
    await run.add({ id: step.id, label: step.label, state: "failed", detail: `${LS[0].toUpperCase()}${LS.slice(1)} said no.`, reason: res.error ?? "No id came back.", request: payload });
    return null;
  }
  ids[step.idKey] = id;
  await run.add({ id: step.id, label: step.label, state: "done", detail: `Added to ${LS} (contact ${id}), tagged "${OS_TAG}".` });
  return id;
}

async function toRex(t: TakeOn, run: Run, opts: PushOptions) {
  if (!rexConfigured()) {
    await run.add({ id: "rex", label: "The listing system", state: "failed", detail: `${LS[0].toUpperCase()}${LS.slice(1)} isn't connected on this environment.` });
    return;
  }
  /* As the person pressing it, never the office account: a record nobody can
     be shown to have made is worse than none (lib/rex-contacts). */
  const token = run.live ? await rexTokenFor(opts.byUserId).catch(() => null) : null;
  if (run.live && !token) {
    await run.add({ id: "sign-in", label: "Your sign-in", state: "blocked", detail: `You have no sign-in to ${LS} held, so anything made would be under the office account rather than your name. Link it on Profile, then press again.` });
    return;
  }

  /* 1. The landlord. */
  const landlordId = await contactStep(run, token, { id: "landlord", label: `Landlord: ${t.landlord.name}`, idKey: "landlord", name: t.landlord.name, email: t.landlord.email, phone: t.landlord.phone });

  /* 2. The home. A REX listing is already there; so is an OS record REX was matched to. */
  const ids = run.push.ids;
  const homeLabel = `The home: ${t.line1}`;
  let rexPropertyId: string | null = ids.property ?? null;
  if (!rexPropertyId && t.osPropertyId) {
    rexPropertyId = str((await q<{ rex_property_id: string | null }>(`SELECT rex_property_id FROM os_properties WHERE id = $1`, [t.osPropertyId]).catch(() => []))[0]?.rex_property_id);
  }
  if (/^\d+$/.test(t.homeRef)) {
    await run.add({ id: "property", label: homeLabel, state: "done", detail: `Already in ${LS} (listing ${t.homeRef}). Left as it is.` });
  } else if (rexPropertyId) {
    await run.add({ id: "property", label: homeLabel, state: "done", detail: `Already in ${LS} (property ${rexPropertyId}). Left as it is.` });
  } else {
    const parts = splitLine1(t.line1);
    const asked = { unitNumber: parts.unitNumber, streetNumber: parts.streetNumber, streetName: parts.streetName, town: t.town, postcode: t.postcode, ownerContactId: landlordId };
    if (!run.live) {
      await run.add({
        id: "property",
        label: homeLabel,
        state: "would",
        detail: `Not in ${LS}. Would add it${landlordId ? " with the landlord as owner" : ", and the landlord as owner once they are there"}.${!t.town ? " It has no town yet, which would stop it." : ""}`,
        request: asked,
      });
    } else {
      const made = await createProperty(asked, opts.byUserId);
      if (made.ok) {
        ids.property = made.propertyId;
        await run.add({ id: "property", label: homeLabel, state: "done", detail: `Added to ${LS} (property ${made.propertyId})${made.ownerDropped ? ". The landlord couldn't be joined as owner, so join them there by hand" : landlordId ? " with the landlord as owner" : ""}.`, request: asked });
      } else {
        const waits = ["switch_off", "writes_locked", "no_rex_session", "rex_session_expired", "incomplete"].includes(made.reason);
        await run.add({ id: "property", label: homeLabel, state: waits ? "blocked" : "failed", detail: made.detail, reason: made.ownerDetail ?? null, request: asked });
      }
    }
  }

  /* 3. The sitting tenants, as people. Joining them to the home's tenancy is
     not done here: the tenancy lives in REX PM, which has no way in. */
  for (const [i, x] of t.tenants.entries()) {
    await contactStep(run, token, { id: `tenant:${i}`, label: `Tenant: ${x.name}`, idKey: `tenant:${i}`, name: x.name, email: x.email, phone: x.phone });
  }
}

export type { TakeOnPush };
