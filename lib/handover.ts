import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { rexCall } from "@/lib/rex";
import { propolyConfigured, propolyGet, propolyPatch, propolyPost } from "@/lib/business/propoly";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { switchOn } from "@/lib/switches";
import { handoffFor, type Handoff } from "@/lib/deal-handoff";

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
 *   2. each landlord in Propoly: found by email, or created
 *   3. the property in Propoly: the uuid REX already holds on the listing
 *      (custom field api.propolyPropertyUUID), else matched by postcode and
 *      first line, else created under the listing agent's Propoly user
 *   4. that uuid written back to the REX listing
 *   5. each landlord related to the property
 *   6. the tenants put on the REX listing as purchtenant
 *   7. the accepted email to the landlord (REX template 10978)
 *   8. the accepted email to the tenant (REX template 10979)
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
const LANDLORD_TEMPLATE = "10978";
const TENANT_TEMPLATE = "10979";
const MERGE_LOCATION_ID = "394";
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
  opts: { by: string; mode?: HandoverMode; force?: boolean }
): Promise<HandoverRun> {
  if (!hasDb()) throw new Error("No database on this environment, so a handover has nowhere to be recorded.");
  const switchMode = await handoverMode();
  const mode: HandoverMode = opts.mode === "shadow" ? "shadow" : switchMode;
  const live = mode === "live";

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

    /* 2. Each landlord in Propoly. */
    const landlordUuids: string[] = [];
    for (const c of uniqueOwners) {
      const email = str(c.email_address);
      const name = str(c.name) ?? "the landlord";
      if (!email) {
        await rec.add({ id: `landlord:${str(c.id)}`, label: `Landlord: ${name}`, state: "failed", detail: "No email on the REX contact, and Propoly finds landlords by email." });
        status = "failed";
        continue;
      }
      const found = await propolyGet(`/api/v1/landlords?email=${encodeURIComponent(email)}&page=1&per_page=10`);
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

    /* 3. The property in Propoly. */
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

    if (propertyUuid) {
      propertyFrom = "REX already holds the Propoly uuid on the listing.";
    } else {
      /* Page Propoly's properties, matching on normalised postcode and first line - Howard's match. */
      for (let page = 1; page <= MAX_PROPERTY_PAGES && !propertyUuid; page++) {
        const res = await propolyGet(`/api/v1/properties?page=${page}&per_page=25`);
        const items = listOf(res.body);
        if (!items.length) break;
        const hit = items.find(
          (p) => norm(p.postcode) === norm(postcode) && norm(p.address_line1) === norm(line1)
        );
        if (hit) {
          propertyUuid = str(hit.uuid ?? hit.id);
          propertyFrom = `Matched in Propoly on postcode and first line (page ${page}).`;
        }
        if (items.length < 25) break;
      }
    }

    if (propertyUuid) {
      await rec.add({ id: "property", label: "Property in Propoly", state: "ok", detail: `${propertyFrom} ${propertyUuid}`, response: { uuid: propertyUuid } });
    } else {
      const agentEmail = str((listing.listing_agent_1 as Row | null)?.email_address) ?? str((listing.system_owner_user as Row | null)?.email_address);
      const user = agentEmail ? await propolyGet(`/api/v1/users?email=${encodeURIComponent(agentEmail)}`) : null;
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

    /* 4. The uuid back onto the REX listing. */
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

    /* 5. Each landlord related to the property.

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

    /* 6. The tenants on the REX listing. */
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

    /* 7 and 8. The accepted emails, through REX, from the listing's owner user. */
    const fromUserId = str((listing.system_owner_user as Row | null)?.id);
    const scotland = str((listing.agreement_type as Row | null)?.id) === "153279";
    const targets = [
      ...(packet.landlord?.contactId ? [{ id: "email-landlord", who: `landlord ${packet.landlord.name}`, contactId: packet.landlord.contactId, template: LANDLORD_TEMPLATE, subject: "Application Accepted" }] : []),
      ...packet.tenants.filter((t) => t.contactId).map((t) => ({ id: `email-tenant:${t.contactId}`, who: `tenant ${t.name}`, contactId: t.contactId as string, template: TENANT_TEMPLATE, subject: "Congratulations, your application has been accepted!" })),
    ];
    for (const t of targets) {
      const mergeObject = {
        contact_id: t.contactId,
        property_id: str(property.id) ?? str(listing.property_id),
        listing_id: packet.listingId,
        tenancy_application_id: packet.applicationId,
      };
      const request = { mail_merge_template_id: t.template, location_id: MERGE_LOCATION_ID, connection_id: -1, send_from_user_id: fromUserId, merge_object: mergeObject, subject: t.subject, scotland };
      if (!fromUserId) {
        await rec.add({ id: t.id, label: `Email to ${t.who}`, state: "failed", detail: "The listing has no owner user to send from.", request });
        status = "failed";
        continue;
      }
      if (!live) {
        /* Render Howard's template against the real objects so the rehearsal shows the words. */
        let preview: unknown = null;
        try {
          const r = await rexCall("MailMerge", "getMergedStringSet", { mail_merge_template_id: t.template, merge_objects: [mergeObject] });
          preview = r.ok ? r.result : { unavailable: r.error };
        } catch (e) {
          preview = { unavailable: (e as Error).message };
        }
        await rec.add({ id: t.id, label: `Email to ${t.who}`, state: "would", detail: `Would send REX template ${t.template} ("${t.subject}") from user ${fromUserId}${scotland ? ", Scottish wording" : ""}.`, request, response: preview });
        continue;
      }
      try {
        const res = await rexCall("MailMerge", "createAndSend", request);
        await rec.add({ id: t.id, label: `Email to ${t.who}`, state: res.ok ? "ok" : "failed", detail: res.ok ? "Sent through REX." : "REX refused.", request, response: res.ok ? res.result : res.error });
        if (!res.ok) status = "failed";
      } catch (e) {
        status = "failed";
        await rec.add({ id: t.id, label: `Email to ${t.who}`, state: "failed", detail: (e as Error).message, request });
      }
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
  const wanted: { title: string; detail: string }[] = [
    {
      title: "Handover: schedule the shadow scan",
      detail:
        "A Railway cron hitting GET https://tle-os.co.uk/api/handover/scan with header x-cron-key: <CRON_SECRET>, hourly. It rehearses every newly accepted application and records what the handover would do, writing nothing.",
    },
    {
      title: "Handover: allow the three REX writes",
      detail:
        "Add Listings/update, CustomFields/setFieldValues and MailMerge/createAndSend to REX_ALLOW_WRITES on the TLE-OS service. Until then the live handover cannot touch REX even with the switch on.",
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
    const exists = await q<{ id: string }>(`SELECT id FROM os_todos WHERE title = $1 LIMIT 1`, [t.title]).catch(() => []);
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
