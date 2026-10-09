import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { rexCall } from "@/lib/rex";
import { propolyConfigured, propolyGet, propolyPatch, propolyPost } from "@/lib/business/propoly";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { switchOn } from "@/lib/switches";
import { handoffFor, type Handoff } from "@/lib/deal-handoff";
import { findUserById } from "@/lib/users";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { HOLDING_FEE_WORDING, SITE, WEEK_AHEAD_LINES } from "@/lib/email/tle-documents";
import { createUpdate, type UpdateRecipient } from "@/lib/customer-updates";
import { userByName } from "@/lib/tenant-email-send";
import { isScottish } from "@/lib/property-flags";
import { parseAddress, postcodeOf, sameHome } from "@/lib/address-parse";

/**
 * The offer-accepted handover, run by the OS.
 *
 * James, 3 Sep: "why would we do that when we have access to Propoly
 * ourselves? ... it keeps everything under one tree ... we can register
 * anything that's going wrong on our side if a deal wasn't created."
 *
 * This is Howard's "TLE: Application Accepted" flow, step for step, read
 * from his export (Downloads, 18 Aug) so the mappings are his and not
 * guessed:
 *
 *   1. the listing, and its owners (deduplicated by email)
 *   2. the property in Propoly, found FIRST: the uuid REX already holds on
 *      the listing (custom field api.propolyPropertyUUID), else the one the
 *      agent picked, else matched by postcode and door; short of a sure match
 *      a live run stops and asks before anything is written (9 Oct 2026)
 *   3. each landlord in Propoly: found by email, or created
 *   4. the property created, only when the agent has said it is new, under
 *      the listing agent's Propoly user
 *   5. that uuid written back to the REX listing
 *   6. each landlord related to the property
 *   7. the tenants put on the REX listing as purchtenant
 *   8. the accepted email to the landlord (REX template 10978)
 *   9. the accepted email to the tenant (REX template 10979)
 *
 * ── Shadow first ──────────────────────────────────────────────────────────
 *
 * With the "handover_live" switch off - the default - every step is worked
 * out against live Propoly and REX READS and recorded as what it WOULD do:
 * the exact payload, the landlord it found, the property it matched. Nothing
 * is written anywhere. Howard's flow carries on meanwhile. When the shadow
 * runs match what his flow did, the switch goes on and his goes off the same
 * day - both at once makes duplicates.
 *
 * Every run is a row in os_handovers with its steps, kept for ever. "Why did
 * that landlord never appear in Propoly" is answered by reading it.
 */

export type HandoverMode = "shadow" | "live";

export interface HandoverStep {
  id: string;
  label: string;
  /** ok: done (live) or confirmed present; would: what live would do; blocked/failed/skipped say so. */
  state: "ok" | "would" | "blocked" | "failed" | "skipped";
  detail: string;
  request?: unknown;
  response?: unknown;
  at: string;
}

export interface HandoverRun {
  id: string;
  applicationId: string;
  mode: HandoverMode;
  status: "running" | "ok" | "failed" | "blocked";
  steps: HandoverStep[];
  packet: Handoff | null;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const norm = (v: unknown) => (str(v) ?? "").toLowerCase().replace(/\s+/g, "");

/* Howard's constants, from the flow definition. */
const PROPERTY_UUID_FIELD = "api.propolyPropertyUUID";
/** How far to page Propoly's properties when matching by address. 25 a page. */
const MAX_PROPERTY_PAGES = 60;

export async function handoverMode(): Promise<HandoverMode> {
  return (await switchOn("handover_live")) ? "live" : "shadow";
}

/* ── the row ──────────────────────────────────────────────────────────────── */

type DbRow = {
  id: string;
  application_id: string;
  mode: string;
  status: string;
  steps: HandoverStep[];
  packet: Handoff | null;
  triggered_by: string;
  started_at: string | Date;
  finished_at: string | Date | null;
  error: string | null;
};

const toRun = (r: DbRow): HandoverRun => ({
  id: r.id,
  applicationId: r.application_id,
  mode: r.mode === "live" ? "live" : "shadow",
  status: (["running", "ok", "failed", "blocked"].includes(r.status) ? r.status : "failed") as HandoverRun["status"],
  steps: Array.isArray(r.steps) ? r.steps : [],
  packet: r.packet ?? null,
  triggeredBy: r.triggered_by,
  startedAt: new Date(r.started_at).toISOString(),
  finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  error: r.error,
});

const COLS = "id, application_id, mode, status, steps, packet, triggered_by, started_at, finished_at, error";

export async function handoversFor(applicationId: string, limit = 5): Promise<HandoverRun[]> {
  if (!hasDb() || !applicationId) return [];
  const rows = await q<DbRow>(
    `SELECT ${COLS} FROM os_handovers WHERE application_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [applicationId, limit]
  ).catch(() => []);
  return rows.map(toRun);
}

export async function latestHandover(applicationId: string): Promise<HandoverRun | null> {
  return (await handoversFor(applicationId, 1))[0] ?? null;
}

/** Applications that have had a run of this mode already - the scan skips them. */
export async function handedOverIds(mode: HandoverMode): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ application_id: string }>(
    `SELECT DISTINCT application_id FROM os_handovers WHERE mode = $1`,
    [mode]
  ).catch(() => []);
  return new Set(rows.map((r) => r.application_id));
}

/* ── the run ──────────────────────────────────────────────────────────────── */

class Recorder {
  steps: HandoverStep[] = [];
  constructor(
    private id: string,
    private mode: HandoverMode
  ) {}
  async add(step: Omit<HandoverStep, "at">) {
    this.steps.push({ ...step, at: new Date().toISOString() });
    if (hasDb()) {
      await q(`UPDATE os_handovers SET steps = $2 WHERE id = $1`, [this.id, JSON.stringify(this.steps)]).catch(
        () => []
      );
    }
  }
  /** "would" in shadow, "ok" in live - the same step, two verbs. */
  get didOrWould(): "ok" | "would" {
    return this.mode === "live" ? "ok" : "would";
  }
}

/**
 * Run the handover for one application, in the mode the switch says (or the
 * one asked for, which only ever narrows: a caller may ask for shadow while
 * the switch is live, never the other way round).
 */
export async function runHandover(
  applicationId: string,
  opts: {
    by: string;
    byId?: string | null;
    mode?: HandoverMode;
    force?: boolean;
    /** The Propoly property the agent picked from the close matches. */
    propertyUuid?: string | null;
    /** The agent has said this home really is new to Propoly. */
    newProperty?: boolean;
  }
): Promise<HandoverRun> {
  if (!hasDb()) throw new Error("No database on this environment, so a handover has nowhere to be recorded.");
  const switchMode = await handoverMode();
  const mode: HandoverMode = opts.mode === "shadow" ? "shadow" : switchMode;
  const live = mode === "live";

  /* NEVER TWICE (18 Sep sweep, item 14). A live run that finished has put
     the landlord and property in Propoly; a second one could make more. Force is the only way past,
     and it is a person pressing it with the first run in front of them. */
  if (live && !opts.force) {
    const prior = await q<{ id: string; finished_at: Date | null }>(
      `SELECT id, finished_at FROM os_handovers WHERE application_id = $1 AND mode = 'live' AND status = 'ok' ORDER BY started_at DESC LIMIT 1`,
      [applicationId]
    ).catch(() => []);
    if (prior.length) {
      throw new Error(`This application was already handed over live (run ${prior[0].id}). Nothing was sent again - open that run, and use force only if it really has to go twice.`);
    }
  }

  const packet = await handoffFor(applicationId);
  if (!packet) throw new Error(`No application ${applicationId}.`);

  const id = randomBytes(9).toString("base64url");
  await q(
    `INSERT INTO os_handovers (id, application_id, mode, status, packet, triggered_by)
     VALUES ($1, $2, $3, 'running', $4, $5)`,
    [id, applicationId, mode, JSON.stringify(packet), opts.by]
  );
  const rec = new Recorder(id, mode);
  let status: HandoverRun["status"] = "ok";
  let fatal: string | null = null;

  try {
    /* 0. What is missing. Live stops here unless forced; shadow carries on so
       the rehearsal still shows the whole shape of the deal. */
    if (packet.blockers.length > 0) {
      await rec.add({
        id: "blockers",
        label: "Before this goes",
        state: live && !opts.force ? "blocked" : "would",
        detail: packet.blockers.join(" "),
      });
      if (live && !opts.force) {
        status = "blocked";
        throw new Stop();
      }
    } else {
      await rec.add({ id: "blockers", label: "Before this goes", state: "ok", detail: "Nothing missing." });
    }

    if (!packet.listingId) {
      await rec.add({ id: "listing", label: "The listing", state: "failed", detail: "The application has no listing, so there is nothing to hand over." });
      status = "failed";
      throw new Stop();
    }

    /* 1. The listing, raw, for the owners' contact fields and the address parts. */
    const listingRes = await rexCall("Listings", "read", { id: packet.listingId });
    if (!listingRes.ok) {
      await rec.add({ id: "listing", label: "The listing", state: "failed", detail: `REX would not read listing ${packet.listingId}.`, response: listingRes.error ?? null });
      status = "failed";
      throw new Stop();
    }
    const listing = (listingRes.result ?? {}) as Row;
    const related = (listing.related ?? {}) as Row;
    const owners = ((related.contact_reln_listing ?? []) as Row[])
      .filter((r) => str((r.reln_type as Row | null)?.id) === "owner")
      .map((r) => (r.contact ?? null) as Row | null)
      .filter((c): c is Row => Boolean(c));
    const uniqueOwners: Row[] = [];
    const seen = new Set<string>();
    for (const c of owners) {
      const key = norm(c.email_address) || `id:${str(c.id) ?? Math.random()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueOwners.push(c);
    }
    await rec.add({
      id: "listing",
      label: "The listing",
      state: uniqueOwners.length ? "ok" : "failed",
      detail: uniqueOwners.length
        ? `${uniqueOwners.length} owner${uniqueOwners.length === 1 ? "" : "s"} on the listing: ${uniqueOwners.map((c) => str(c.name) ?? "unnamed").join(", ")}.`
        : "No owner is attached to the listing, so there is no landlord to create.",
    });
    if (!uniqueOwners.length) {
      status = "failed";
      throw new Stop();
    }

    if (!propolyConfigured()) {
      await rec.add({ id: "propoly", label: "Propoly", state: "failed", detail: "Propoly is not connected on this environment." });
      status = "failed";
      throw new Stop();
    }

    /* 2. The property in Propoly, looked for BEFORE anything is created
       (9 Oct 2026, James: "we cannot afford to have people, when they accept
       an offer, duplicate the Propoly record"). A home already on our books
       reuses its record; only a new listing makes a new one.

       In order: the uuid REX holds on the listing; the property the agent
       picked; a sure match in Propoly by postcode and door (lib/address-parse
       sameHome, so "12b Cliff Road" and "Flat B, 12 Cliff Road" are one home,
       and "Flat 2, 76 Fore Street" is never "76 Fore Street"). Short of a sure
       match a live run stops here, before any landlord is written, and asks:
       the close matches to pick from, or a yes that it is new. */
    const cf = await rexCall("CustomFields", "getValuesKeyedByFieldName", {
      service_name: "Listings",
      service_object_id: packet.listingId,
    });
    const cfValues = ((cf.ok ? cf.result : null) ?? {}) as Row;
    let propertyUuid = str(cfValues[PROPERTY_UUID_FIELD]);
    let propertyFrom = "";

    const property = (listing.property ?? listing) as Row;
    const line1 = [str(property.adr_unit_number), str(property.adr_street_number), str(property.adr_street_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
    const postcode = str(property.adr_postcode) ?? "";
    const ours = `${line1}, ${postcode}`;
    const oursParsed = parseAddress(ours);
    const candidates: PropertyCandidate[] = [];

    if (propertyUuid) {
      propertyFrom = "REX already holds the Propoly uuid on the listing.";
    } else if (opts.propertyUuid) {
      const picked = await propolyGet(`/api/v1/properties/${encodeURIComponent(opts.propertyUuid)}`);
      const p = ((picked.body as Row | null)?.property ?? picked.body) as Row | null;
      if (picked.status >= 200 && picked.status < 300 && p) {
        propertyUuid = str(p.uuid ?? p.id) ?? opts.propertyUuid;
        propertyFrom = `Picked by ${opts.by} from the close matches (${candidateOf(p).address}).`;
      } else {
        await rec.add({ id: "property-match", label: "Property in Propoly", state: live ? "blocked" : "would", detail: `The property picked couldn't be read from Propoly (answered ${picked.status || "nothing"}). Nothing was created. Try again in a few minutes.` });
        if (live) {
          status = "blocked";
          throw new Stop();
        }
      }
    } else {
      for (let page = 1; page <= MAX_PROPERTY_PAGES && !propertyUuid; page++) {
        const res = await propolyGet(`/api/v1/properties?page=${page}&per_page=25`);
        /* A refused or failed page is NOT "not in Propoly" (18 Sep sweep, item
           14): it was being recorded as "would create", and live would have
           created a second home. Not knowing stops a live run. */
        if (res.status >= 400 || res.status === 0) {
          await rec.add({
            id: "property-match",
            label: "Property in Propoly",
            state: live ? "blocked" : "would",
            detail: `Propoly would not list its properties (answered ${res.status || "nothing"} on page ${page}), so it is not known whether this home is already there. Not created. Try again in a few minutes.`,
          });
          if (live) {
            status = "blocked";
            throw new Stop();
          }
          break;
        }
        const items = listOf(res.body);
        if (!items.length) break;
        for (const p of items) {
          const c = candidateOf(p);
          if (!c.uuid) continue;
          const samePostcode = Boolean(postcode) && norm(c.postcode) === norm(postcode);
          /* Howard's exact match, then the door-aware one. */
          const exact = samePostcode && norm(p.address_line1) === norm(line1);
          if (exact || (samePostcode && sameHome(ours, `${c.address}, ${c.postcode}`))) {
            propertyUuid = c.uuid;
            propertyFrom = `Matched in Propoly on postcode and door (page ${page}): ${c.address}.`;
            break;
          }
          /* Close: the same postcode, or the same building on the same street
             under a postcode typed differently. Shown, never assumed. */
          const theirs = parseAddress(c.address);
          const sameBuilding = Boolean(oursParsed.street) && theirs.street === oursParsed.street && oursParsed.building != null && theirs.building === oursParsed.building;
          if ((samePostcode || sameBuilding) && candidates.length < 8) candidates.push(c);
        }
        if (items.length < 25) break;
      }
    }

    if (propertyUuid) {
      await rec.add({ id: "property-match", label: "Property in Propoly", state: "ok", detail: `${propertyFrom} Reusing it, so nothing is duplicated.`, response: { uuid: propertyUuid } });
    } else if (!opts.newProperty) {
      await rec.add({
        id: "property-match",
        label: "Property in Propoly",
        state: live ? "blocked" : "would",
        detail: candidates.length
          ? `Not sure this home is in Propoly yet. ${candidates.length} close match${candidates.length === 1 ? "" : "es"} - pick the right one, or say it's new.`
          : "This home isn't in Propoly yet. Say it's new and it will be created.",
        response: { candidates, ours: { address: line1, postcode } },
      });
      if (live) {
        status = "blocked";
        throw new Stop();
      }
    } else {
      await rec.add({ id: "property-match", label: "Property in Propoly", state: "ok", detail: `${opts.by} confirmed this home is new to Propoly.` });
    }

    /* 3. Each landlord in Propoly - only once the property is settled. */
    const landlordUuids: string[] = [];
    for (const c of uniqueOwners) {
      const email = str(c.email_address);
      const name = str(c.name) ?? "the landlord";
      if (!email) {
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "failed", detail: "No email on the REX contact, and Propoly finds landlords by email." });
        status = "failed";
        continue;
      }
      /* Lower case: Propoly's email search is case-sensitive, and REX keeps
         whatever was typed ("Rhiannon.Dodge@" found nobody, 9 Oct 2026). */
      const found = await propolyGet(`/api/v1/landlords?email=${encodeURIComponent(email.toLowerCase())}&page=1&per_page=10`);
      const hit = firstMatch(found.body, (l) => norm(l.email) === norm(email));
      if (hit && str(hit.uuid ?? hit.id)) {
        const uuid = str(hit.uuid ?? hit.id) as string;
        landlordUuids.push(uuid);
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "ok", detail: `Already in Propoly (${uuid}).`, response: { uuid } });
        continue;
      }
      /* Not there: Howard reads the contact for its parts, then creates. */
      const contact = await rexCall("Contacts", "read", { id: str(c.id) });
      const cc = ((contact.ok ? contact.result : null) ?? c) as Row;
      const payload = {
        landlord: {
          title: str(cc.title) ?? (norm(cc.marketing_gender) === "female" ? "Ms" : "Mr"),
          first_name: (str(cc.first_name) ?? name.split(/\s+/)[0] ?? "").slice(0, 20),
          middle_name: str(cc.middle_name) ?? "",
          last_name: str(cc.last_name) ?? name.split(/\s+/).slice(1).join(" "),
          mobileno: str(cc.system_e164_phone_number) ?? str(cc.phone_number) ?? "",
          email,
        },
      };
      if (!live) {
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "would", detail: `Not in Propoly. Would create with these details.`, request: payload });
        landlordUuids.push(`(new landlord: ${email})`);
        continue;
      }
      const made = await propolyPost("/api/v1/landlords", payload);
      const uuid = str(((made.body as Row | null)?.landlord as Row | null)?.uuid) ?? str((made.body as Row | null)?.uuid);
      if (made.status >= 200 && made.status < 300 && uuid) {
        landlordUuids.push(uuid);
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "ok", detail: `Created in Propoly (${uuid}).`, request: payload, response: made.body });
      } else {
        status = "failed";
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "failed", detail: `Propoly answered ${made.status}.`, request: payload, response: made.body });
      }
    }

    /* 4. A new property, only when nothing matched and the agent said it is new. */
    if (!propertyUuid) {
      const agentEmail = str((listing.listing_agent_1 as Row | null)?.email_address) ?? str((listing.system_owner_user as Row | null)?.email_address);
      /* Lower case, as above: REX had "Rhiannon.Dodge@...", Propoly matched only "rhiannon.dodge@...". */
      const user = agentEmail ? await propolyGet(`/api/v1/users?email=${encodeURIComponent(agentEmail.toLowerCase())}`) : null;
      const managedBy = user ? str(firstMatch(user.body, () => true)?.id ?? firstMatch(user.body, () => true)?.uuid) : null;
      const attrs = ((listing.attributes ?? property.attributes ?? {}) as Row);
      const payload = {
        property: {
          managed_by_user_id: managedBy,
          address_line1: line1,
          address_line2: typeof property.adr_building === "string" ? property.adr_building : (str((property.adr_building as Row | null)?.name) ?? ""),
          town: str(property.adr_suburb_or_town) ?? "",
          county: str(property.adr_state_or_region) ?? "",
          district: str(property.adr_locality) ?? "",
          postcode,
          rent_type: "entire_property",
          number_of_bedrooms: attrs.attr_bedrooms ?? listing.attr_bedrooms ?? null,
          gas: attrs.attr_has_gas ?? listing.attr_has_gas ?? null,
        },
      };
      if (!managedBy) {
        await rec.add({ id: "property", label: "Property in Propoly", state: "failed", detail: `Not in Propoly, and no Propoly user matches the listing agent${agentEmail ? ` (${agentEmail})` : ""}, so it cannot be created under anyone.`, request: payload });
        status = "failed";
      } else if (!live) {
        await rec.add({ id: "property", label: "Property in Propoly", state: "would", detail: `Not in Propoly. Would create it under ${agentEmail}.`, request: payload });
        propertyUuid = "(new property)";
      } else {
        const made = await propolyPost("/api/v1/properties", payload);
        const uuid = str(((made.body as Row | null)?.property as Row | null)?.uuid) ?? str((made.body as Row | null)?.uuid);
        if (made.status >= 200 && made.status < 300 && uuid) {
          propertyUuid = uuid;
          await rec.add({ id: "property", label: "Property in Propoly", state: "ok", detail: `Created in Propoly (${uuid}).`, request: payload, response: made.body });
        } else {
          status = "failed";
          await rec.add({ id: "property", label: "Property in Propoly", state: "failed", detail: `Propoly answered ${made.status}.`, request: payload, response: made.body });
        }
      }
    }

    /* 5. The uuid back onto the REX listing. */
    if (propertyUuid && !str(cfValues[PROPERTY_UUID_FIELD])) {
      const payload = { service_name: "Listings", service_object_id: packet.listingId, value_map: { [PROPERTY_UUID_FIELD]: propertyUuid } };
      if (!live) {
        await rec.add({ id: "rex-uuid", label: "Propoly uuid on the REX listing", state: "would", detail: "Would write the uuid to the listing's custom field.", request: payload });
      } else {
        try {
          const res = await rexCall("CustomFields", "setFieldValues", payload);
          await rec.add({ id: "rex-uuid", label: "Propoly uuid on the REX listing", state: res.ok ? "ok" : "failed", detail: res.ok ? "Written." : "REX refused.", request: payload, response: res.ok ? res.result : res.error });
          if (!res.ok) status = "failed";
        } catch (e) {
          status = "failed";
          await rec.add({ id: "rex-uuid", label: "Propoly uuid on the REX listing", state: "failed", detail: (e as Error).message, request: payload });
        }
      }
    } else if (propertyUuid) {
      await rec.add({ id: "rex-uuid", label: "Propoly uuid on the REX listing", state: "ok", detail: "Already on the listing." });
    }

    /* 6. Each landlord related to the property.

       Propoly's read API shows no landlord-property relationship anywhere,
       but a deal on the property lists its landlords. So a landlord who is
       already on any Propoly deal for this property was related by whoever
       made that deal - Howard's flow, most likely - and the rehearsal says
       so rather than "would relate" a link that exists. Live, it is skipped
       too: a 409 would come back anyway, and the run reads cleaner without
       it. */
    const relatedAlready = new Set<string>();
    if (propertyUuid && !propertyUuid.startsWith("(")) {
      const deals = (await getAllPropolyDeals().catch(() => null)) ?? [];
      for (const d of deals) {
        if (d.app.propoly?.propertyUuid === propertyUuid) for (const u of d.app.propoly.landlordUuids ?? []) relatedAlready.add(u);
      }
    }
    for (const uuid of landlordUuids) {
      const payload = { associated_type: "Property", associated_uuid: propertyUuid };
      if (relatedAlready.has(uuid)) {
        await rec.add({ id: `relationship:${uuid}`, label: `Landlord ${uuid} ↔ property`, state: "ok", detail: "Already related: this landlord is on a Propoly deal for this property.", request: payload });
        continue;
      }
      if (!live || uuid.startsWith("(") || !propertyUuid || propertyUuid.startsWith("(")) {
        await rec.add({ id: `relationship:${uuid}`, label: `Landlord ${uuid} ↔ property`, state: live ? "skipped" : "would", detail: live ? "Skipped: a step before it did not produce an id." : "Would relate the landlord to the property.", request: payload });
        continue;
      }
      const res = await propolyPatch(`/api/v1/landlords/${uuid}/relationships`, payload);
      const ok = (res.status >= 200 && res.status < 300) || res.status === 409;
      await rec.add({ id: `relationship:${uuid}`, label: `Landlord ${uuid} ↔ property`, state: ok ? "ok" : "failed", detail: res.status === 409 ? "Already related." : ok ? "Related." : `Propoly answered ${res.status}.`, request: payload, response: res.body });
      if (!ok) status = "failed";
    }

    /* 7. The tenants on the REX listing. */
    const tenantIds = packet.tenants.map((t) => t.contactId).filter((x): x is string => Boolean(x));
    if (tenantIds.length) {
      const payload = { data: { id: packet.listingId, related: { contact_reln_listing: tenantIds.map((contact_id) => ({ contact_id, reln_type_id: "purchtenant" })) } } };
      if (!live) {
        await rec.add({ id: "rex-tenants", label: "Tenants on the REX listing", state: "would", detail: `Would put ${tenantIds.length} tenant${tenantIds.length === 1 ? "" : "s"} on the listing as purchtenant.`, request: payload });
      } else {
        try {
          const res = await rexCall("Listings", "update", payload);
          await rec.add({ id: "rex-tenants", label: "Tenants on the REX listing", state: res.ok ? "ok" : "failed", detail: res.ok ? "Written." : "REX refused.", request: payload, response: res.ok ? null : res.error });
          if (!res.ok) status = "failed";
        } catch (e) {
          status = "failed";
          await rec.add({ id: "rex-tenants", label: "Tenants on the REX listing", state: "failed", detail: (e as Error).message, request: payload });
        }
      }
    } else {
      await rec.add({ id: "rex-tenants", label: "Tenants on the REX listing", state: "failed", detail: "No tenant on the application has a REX contact id." });
      status = "failed";
    }

    /* 8 and 9. The accepted emails - written here, SENT BY THE AGENT.

       They were REX merge templates 10978 and 10979 (Howard's words, then our
       own from 16 Sep). Since 2 Oct 2026 (James: "allow the agent to push all
       of them notifications") the handover sends neither: it puts them with
       the agent as a customer update (lib/customer-updates), already written,
       to send from their own address after reading, or to ring instead. */
    const scotland = str((listing.agreement_type as Row | null)?.id) === "153279";
    const sender = opts.byId ? await findUserById(opts.byId).catch(() => null) : null;
    const recipients = acceptedRecipients(packet, { scotland, senderName: sender?.name ?? null, senderEmail: sender?.email ?? null });
    const address = [packet.property, packet.locality].filter(Boolean).join(", ");
    if (!live) {
      for (const r of recipients) {
        const { subject } = renderTleEmail(r.emailId, r.vars);
        await rec.add({ id: `tell-${r.role}:${r.contactId ?? r.name}`, label: `Tell ${r.role} ${r.name}`, state: "would", detail: `Would put "${subject}" with the agent to send or ring about. Nothing goes to them by itself.`, request: { to: r.email, subject, email: r.emailId } });
      }
    } else {
      const made = await putAcceptedWithAgent(applicationId, { packet, scotland, sender }).catch(() => null);
      await rec.add({
        id: "tell-customers",
        label: "Tell the landlord and tenants",
        state: "ok",
        detail: made
          ? `Put with ${made.agentName ?? "the agent"} to tell them (update ${made.id}): ${recipients.map((r) => r.name).join(", ")}. Nothing went to them by itself.`
          : `Already with the agent to tell them about ${address}.`,
      });
    }
  } catch (e) {
    if (!(e instanceof Stop)) {
      status = "failed";
      fatal = e instanceof Error ? e.message : String(e);
      await rec.add({ id: "fatal", label: "Stopped", state: "failed", detail: fatal });
    }
  }

  await q(`UPDATE os_handovers SET status = $2, steps = $3, finished_at = NOW(), error = $4 WHERE id = $1`, [
    id,
    status,
    JSON.stringify(rec.steps),
    fatal,
  ]);
  return (await latestHandover(applicationId)) as HandoverRun;
}

class Stop extends Error {}

/** A Propoly property offered to the agent as a possible match. */
export interface PropertyCandidate {
  uuid: string;
  address: string;
  postcode: string;
}

function candidateOf(p: Row): PropertyCandidate {
  const address = [str(p.address_line1), str(p.address_line2)].filter(Boolean).join(", ");
  return { uuid: str(p.uuid ?? p.id) ?? "", address, postcode: str(p.postcode) ?? postcodeOf(address) ?? "" };
}

/** Propoly lists come back as {data: [...]}, {landlords: [...]}, or a bare array. */
function listOf(body: unknown): Row[] {
  if (Array.isArray(body)) return body as Row[];
  const b = (body ?? {}) as Row;
  for (const key of ["data", "landlords", "properties", "users", "items", "results"]) {
    if (Array.isArray(b[key])) return b[key] as Row[];
  }
  return [];
}
function firstMatch(body: unknown, pred: (r: Row) => boolean): Row | null {
  return listOf(body).find(pred) ?? null;
}

/* ── the reminders ────────────────────────────────────────────────────────── */

/**
 * What has to happen before this runs for real, on the owner's to-do list.
 * James, 3 Sep: "make it a thing that we would need to switch on on the main
 * to-do list so we've got a reminder of things that we need to sort."
 * Inserted once each; a done item is not brought back.
 */
export async function ensureHandoverTodos(): Promise<number> {
  if (!hasDb()) return 0;
  /* `was`: a title this item used to carry. The lookup is by title, so a
     rename without it would put the same job on the list a second time. */
  const wanted: { title: string; detail: string; was?: string }[] = [
    {
      title: "Handover: schedule the shadow scan",
      detail:
        "A Railway cron hitting GET https://tle-os.co.uk/api/handover/scan with header x-cron-key: <CRON_SECRET>, hourly. It rehearses every newly accepted application and records what the handover would do, writing nothing.",
    },
    {
      title: "Handover: allow the two REX writes",
      was: "Handover: allow the three REX writes",
      detail:
        "Add Listings/update and CustomFields/setFieldValues to REX_ALLOW_WRITES on the TLE-OS service. Until then the live handover cannot touch REX even with the switch on. The accepted emails no longer need it - they go from the agent's own mailbox now.",
    },
    {
      title: "Handover: compare the rehearsals with Howard's flow, then switch it on",
      detail:
        "Open a few accepted applications and check the rehearsal against what Howard's flow actually did in Propoly. When they agree: Admin → Switches → \"Handover: create in Propoly, update REX, email both parties\" ON, and Howard turns TLE: Application Accepted OFF the same day. Both running makes duplicates.",
    },
    {
      title: "Rotate the Propoly API key",
      detail:
        "It sits in plain text in the Power Automate export (applicationaccepted_20260818095524.zip in Downloads). Rotate it in Propoly and update PROPOLY_API_KEY on Railway.",
    },
  ];
  let added = 0;
  for (const t of wanted) {
    /* An open item still under its old title takes the new words in place. */
    if (t.was) {
      await q(`UPDATE os_todos SET title = $1, detail = $2 WHERE title = $3 AND state <> 'done'`, [t.title, t.detail, t.was]).catch(() => []);
    }
    const exists = await q<{ id: string }>(`SELECT id FROM os_todos WHERE title = ANY($1::text[]) LIMIT 1`, [[t.title, ...(t.was ? [t.was] : [])]]).catch(() => []);
    if (exists.length) continue;
    await q(`INSERT INTO os_todos (id, title, detail, area) VALUES ($1, $2, $3, 'handover')`, [
      randomBytes(9).toString("base64url"),
      t.title,
      t.detail,
    ]).catch(() => []);
    added++;
  }
  return added;
}


/* ───────────────── the landlord said yes: with the agent ───────────────── */

/**
 * The two accepted emails, written for the people on the application: the
 * landlord's confirmation, and each tenant's "the landlord has said yes" with
 * the holding fee and every step to the keys. Drafts for the agent
 * (lib/customer-updates), never sent from here.
 */
export function acceptedRecipients(
  packet: Handoff,
  o: { scotland: boolean; senderName: string | null; senderEmail: string | null }
): Omit<UpdateRecipient, "state">[] {
  const address = [packet.property, packet.locality].filter(Boolean).join(", ");
  const money = (p: number | null) => (p == null ? null : `£${p.toLocaleString("en-GB")} pcm`);
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  /* Only what the application actually holds. Howard's template printed eight
     lines whether or not REX had them; a row saying "Conditions:" and nothing
     else is worse than no row. */
  const detailsList = [
    ["Offer amount", money(packet.rentPcm)],
    ["Start date", day(packet.startDate)],
    ["Length of tenancy", packet.agreementMonths ? `${packet.agreementMonths} months` : null],
    ["Date accepted", day(packet.acceptedOn)],
    ["Tenant names", packet.tenants.map((t) => t.name).filter(Boolean).join(", ") || null],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: <strong>${v}</strong>`)
    .join("<br>");
  const agentPhone = "0161 883 2525";
  const agentName = o.senderName ?? packet.agent ?? "The Letting Experts";
  /* One week's rent, and never a penny over: the Tenant Fees Act caps a
     holding deposit at a week, so this rounds DOWN to the penny rather than
     to the nearest pound. */
  const holdingFee =
    packet.rentPcm && packet.rentPcm > 0
      ? (() => {
          const pence = Math.floor(((packet.rentPcm * 12) / 52) * 100);
          return pence % 100 === 0
            ? `£${(pence / 100).toLocaleString("en-GB")}`
            : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        })()
      : null;
  const out: Omit<UpdateRecipient, "state">[] = [];
  if (packet.landlord) {
    out.push({
      role: "landlord",
      name: packet.landlord.name,
      email: packet.landlord.email,
      contactId: packet.landlord.contactId,
      emailId: "application-accepted-landlord",
      vars: { landlordName: packet.landlord.name, address, detailsList, agentName, agentPhone, agentEmail: o.senderEmail ?? "" },
    });
  }
  for (const t of packet.tenants) {
    out.push({
      role: "tenant",
      name: t.name,
      email: t.email,
      contactId: t.contactId,
      emailId: "application-its-yours",
      vars: {
        /* Scotland takes no holding deposit, so it gets its own line
           (HOLDING_FEE_WORDING) - still wants checking by somebody who knows
           Scottish lettings. */
        firstName: t.name.trim().split(/\s+/)[0] || "there",
        address,
        holdingFeeLine: o.scotland
          ? HOLDING_FEE_WORDING.scotland.accepted()
          : HOLDING_FEE_WORDING.england.accepted(holdingFee ?? "one week's rent"),
        weekAheadList: WEEK_AHEAD_LINES,
        link: `${SITE}/tenant/tenancy`,
        agentName,
        agentPhone,
        agentEmail: o.senderEmail ?? "",
      },
    });
  }
  return out;
}

/**
 * "The landlord has said yes", put with the agent. Called by a live handover
 * and by the hourly application pass (lib/tenant-journey-emails) when REX
 * moves an application to accepted; one key, so whichever comes first wins
 * and the other finds it there.
 */
export async function putAcceptedWithAgent(
  applicationId: string,
  o: { packet?: Handoff; scotland?: boolean; sender?: { name: string; email: string } | null } = {}
) {
  const packet = o.packet ?? (await handoffFor(applicationId));
  if (!packet) return null;
  const agent = o.sender ?? (packet.agent ? await userByName(packet.agent).catch(() => null) : null);
  const scotland = o.scotland ?? isScottish(packet.locality);
  const recipients = acceptedRecipients(packet, { scotland, senderName: agent?.name ?? null, senderEmail: agent?.email ?? null });
  return createUpdate({
    key: `accepted:${applicationId}`,
    applicationId,
    property: [packet.property, packet.locality].filter(Boolean).join(", "),
    agentEmail: agent?.email ?? null,
    agentName: agent?.name ?? packet.agent ?? null,
    kind: "application_accepted",
    headline: "The landlord has said yes",
    why: packet.blockers.length ? `Before the handover can go: ${packet.blockers.join(" ")}` : "",
    recipients,
  });
}
