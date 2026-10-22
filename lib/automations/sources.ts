import "server-only";
import { q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { NOT_SALES } from "@/lib/lead-ledger";
import { leadHeldBySql } from "@/lib/lead-owner";
import type { ConditionKey, Params, Step, TriggerKey } from "@/lib/automations/catalogue";
import type { Subject } from "@/lib/automations/store";

/**
 * WHAT HAPPENED, read from the tables where it already happens.
 *
 * No hooks in the screens: each trigger is a question asked of the OS's own
 * tables every five minutes - "what happened between the last look and now,
 * on THIS agent's book?" - so an automation can never see further than the
 * agent can on their own boards, and adding one never touches the code that
 * records the thing in the first place. Reads only, every one.
 *
 * Whose is it, per table (the same rules the boards use):
 *
 *   os_leads             REX assignee, or whoever it was passed to in the OS
 *   os_viewings          the diary it is in, by name
 *   offers               the listing agent the offer was sent to (email)
 *   os_tenant_passports  the agent who sent it
 *   os_handovers         the let's agent, by name
 *   os_tenancy_archive   the managed home's agent (REX id)
 *   os_audit listings    the listing is in their own book
 *
 * A date-shaped event (move-in, anniversary, a certificate's N days) happens
 * at 9am London on the day, and is caught by the first look after that.
 */

export interface Window {
  since: Date;
  until: Date;
}

/** Their name as the tables write it, matched on first and last word: "Lianna Jane Denholm" is "Lianna Denholm" in REX. */
function nameParts(owner: OsUser): [string, string] {
  const w = (owner.name || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return [w[0] ?? "\u0000", w[w.length - 1] ?? "\u0000"];
}
const nameIs = (col: string, a: number, b: number) =>
  `(LOWER(split_part(TRIM(${col}), ' ', 1)) = $${a} AND LOWER(regexp_replace(TRIM(${col}), '^.*\\s', '')) = $${b})`;

const clip = (s: unknown, n = 200) => String(s ?? "").trim().slice(0, n);
const pcOf = (address: string) => /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i.exec(address.trim())?.[1]?.toUpperCase() ?? null;
const who = (email: string | null | undefined, phone: string | null | undefined, fallback: string) =>
  (email || "").trim().toLowerCase() || (phone || "").replace(/\D/g, "") || fallback;

function subject(p: Omit<Partial<Subject>, "at"> & { key: string; at: Date | string; what: string }): Subject {
  const address = clip(p.address);
  return {
    key: p.key,
    at: new Date(p.at).toISOString(),
    name: clip(p.name, 120),
    email: p.email ? clip(p.email, 200) : null,
    phone: p.phone ? clip(p.phone, 40) : null,
    address,
    postcode: p.postcode ?? pcOf(address),
    listingId: p.listingId ? String(p.listingId) : null,
    leadId: p.leadId ?? null,
    propertyId: p.propertyId ? String(p.propertyId) : null,
    what: clip(p.what, 240),
    facts: p.facts ?? {},
  };
}

/** A London day at 9am as a timestamp, in SQL, from a DATE expression. */
const nineAm = (dateSql: string) => `((${dateSql})::timestamp + interval '9 hours') AT TIME ZONE 'Europe/London'`;

type Tenant = { name?: string; email?: string | null; phone?: string | null; isPrimary?: boolean };

export async function findEvents(trigger: TriggerKey, params: Params, owner: OsUser, w: Window): Promise<Subject[]> {
  const [first, last] = nameParts(owner);
  const rex = owner.rexUserId ?? "\u0000";
  const out: Subject[] = [];

  switch (trigger) {
    case "lead.new": {
      const kind = String(params.kind ?? "tenant");
      const kindSql = kind === "tenant" ? `AND COALESCE(l.enquiry, '') NOT IN ('Landlord', 'Valuation')` : kind === "landlord" ? `AND l.enquiry IN ('Landlord', 'Valuation')` : "";
      const rows = await q<{ id: string; first_seen: Date; name: string | null; email: string | null; phone: string | null; address: string | null; listing_id: string | null; source: string | null; enquiry: string | null }>(
        `SELECT l.id, l.first_seen, l.name, l.email, l.phone, l.address, l.listing_id, l.source, l.enquiry FROM os_leads l
          WHERE l.first_seen > $1 AND l.first_seen <= $2
            AND COALESCE(l.received_at, l.first_seen) > $1::timestamptz - interval '1 day'
            AND COALESCE(l.source, '') <> 'REX diary'
            AND ${NOT_SALES}
            AND l.id NOT IN (SELECT id FROM os_hidden_leads)
            AND ${leadHeldBySql("l", "$3")}
            ${kindSql}
          ORDER BY l.first_seen LIMIT 100`,
        [w.since, w.until, rex]
      );
      for (const r of rows) {
        const landlord = r.enquiry === "Landlord" || r.enquiry === "Valuation";
        out.push(subject({
          key: `c:${who(r.email, r.phone, r.id)}`,
          at: r.first_seen, name: r.name ?? "", email: r.email, phone: r.phone, address: r.address ?? "",
          listingId: r.listing_id, leadId: r.id,
          what: `${landlord ? "Landlord lead" : "Enquiry"}${r.address ? ` on ${r.address}` : ""}${r.source ? ` from ${r.source}` : ""}`,
          facts: { source: r.source, person: landlord ? "landlord" : "tenant" },
        }));
      }
      break;
    }

    case "viewing.booked":
    case "viewing.done": {
      const booked = trigger === "viewing.booked";
      /* Booked: first seen in the window, still ahead. Done: its end passed in
         the window, not cancelled, not marked a no-show. */
      const rows = await q<{ id: string; listing_id: string | null; property_id: string | null; title: string; starts_at: Date; at: Date; contacts: { id?: string; name?: string; email?: string | null; phone?: string | null; leadId?: string }[]; label: string | null }>(
        `SELECT v.id, v.listing_id, v.property_id, COALESCE(v.payload->>'listingLabel', v.title) AS title, v.starts_at, v.contacts,
                ${booked ? "v.first_seen" : "COALESCE(v.ends_at, v.starts_at + make_interval(mins => v.mins))"} AS at,
                f.label
           FROM os_viewings v LEFT JOIN os_viewing_feedback f ON f.viewing_id = v.id
          WHERE v.kind = 'viewing' AND NOT v.cancelled
            AND ${nameIs("v.agent", 3, 4)}
            AND ${booked ? "v.first_seen > $1 AND v.first_seen <= $2 AND v.starts_at > NOW()" : "COALESCE(v.ends_at, v.starts_at + make_interval(mins => v.mins)) > $1 AND COALESCE(v.ends_at, v.starts_at + make_interval(mins => v.mins)) <= $2 AND COALESCE(f.attended, TRUE)"}
          ORDER BY at LIMIT 100`,
        [w.since, w.until, first, last]
      );
      for (const r of rows) {
        for (const c of r.contacts ?? []) {
          if (!c?.name && !c?.email) continue;
          const when = new Date(r.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
          out.push(subject({
            key: `c:${who(c.email, c.phone, `${r.id}:${c.id ?? c.name}`)}${booked ? "" : `:${r.id}`}`,
            at: r.at, name: c.name ?? "", email: c.email, phone: c.phone, address: r.title,
            listingId: r.listing_id, propertyId: r.property_id, leadId: c.leadId ?? null,
            what: `Viewing at ${r.title}, ${when}`,
            facts: { viewingId: r.id },
          }));
        }
      }
      break;
    }

    case "offer.made":
    case "offer.accepted":
    case "let.agreed": {
      if (trigger === "let.agreed") {
        /* A let is agreed when its handover runs (os_handovers): the packet
           carries the tenants, the home and the move-in date. Live or
           rehearsed alike - the let was accepted either way. */
        const rows = await q<{ application_id: string; at: Date; packet: { tenants?: Tenant[]; property?: string; locality?: string; listingId?: string; startDate?: string } }>(
          `SELECT DISTINCT ON (h.application_id) h.application_id, COALESCE(h.finished_at, h.started_at) AS at, h.packet
             FROM os_handovers h
            WHERE h.packet IS NOT NULL AND h.status IN ('ok', 'blocked')
              AND COALESCE(h.finished_at, h.started_at) > $1 AND COALESCE(h.finished_at, h.started_at) <= $2
              AND ${nameIs("h.packet->>'agent'", 3, 4)}
            ORDER BY h.application_id, h.started_at`,
          [w.since, w.until, first, last]
        );
        for (const r of rows) {
          const home = [r.packet.property, r.packet.locality].filter(Boolean).join(", ");
          for (const t of r.packet.tenants ?? []) {
            out.push(subject({ key: `c:${who(t.email, t.phone, `${r.application_id}:${t.name}`)}`, at: r.at, name: t.name ?? "", email: t.email, phone: t.phone, address: home, listingId: r.packet.listingId, what: `Let agreed on ${home}`, facts: { moveIn: r.packet.startDate ?? null } }));
          }
        }
        break;
      }
      const accepted = trigger === "offer.accepted";
      const rows = await q<{ id: string; name: string; email: string; listing_id: string | null; address: string; payload: { amount?: number; applicants?: Tenant[] }; at: Date }>(
        accepted
          ? `SELECT r.id, r.name, r.email, r.listing_id, r.address, r.payload, d.decided_at AS at
               FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
              WHERE d.decision = 'accepted' AND d.decided_at > $1 AND d.decided_at <= $2 AND LOWER(r.sent_to) = LOWER($3)
              LIMIT 100`
          : `SELECT r.id, r.name, r.email, r.listing_id, r.address, r.payload, r.created_at AS at
               FROM os_tenant_viewing_responses r
              WHERE r.kind = 'offer' AND r.created_at > $1 AND r.created_at <= $2 AND LOWER(r.sent_to) = LOWER($3)
              LIMIT 100`,
        [w.since, w.until, owner.email]
      );
      for (const r of rows) {
        const lead = (r.payload.applicants ?? []).find((a) => a.isPrimary) ?? null;
        out.push(subject({
          key: `c:${who(r.email, lead?.phone, r.id)}`,
          at: r.at, name: r.name || lead?.name || "", email: r.email, phone: lead?.phone ?? null, address: r.address, listingId: r.listing_id,
          what: `${accepted ? "Offer accepted" : "Offer"} on ${r.address}${r.payload.amount ? ` at £${r.payload.amount}` : ""}`,
          facts: { offerId: r.id },
        }));
      }
      break;
    }

    case "passport.sent":
    case "passport.started":
    case "passport.finished": {
      const col = trigger === "passport.sent" ? "p.invited_at" : trigger === "passport.finished" ? "p.submitted_at" : "p.updated_at";
      /* Started: answers beyond the name and email the invite seeded, not yet finished. */
      const extra = trigger === "passport.started"
        ? `AND p.submitted_at IS NULL AND (SELECT COUNT(*) FROM jsonb_object_keys(p.data) k WHERE k NOT IN ('legalName', 'email', 'knownAs', 'scottishHome')) > 0`
        : "";
      const rows = await q<{ token: string; name: string; email: string; mobile: string | null; at: Date }>(
        `SELECT p.token, p.name, p.email, p.data->>'mobile' AS mobile, ${col} AS at FROM os_tenant_passports p
          WHERE p.agent_id = $3 AND COALESCE(p.contact_id, '') <> 'demo'
            AND ${col} > $1 AND ${col} <= $2 ${extra}
          LIMIT 100`,
        [w.since, w.until, owner.id]
      );
      for (const r of rows) {
        out.push(subject({ key: `c:${who(r.email, r.mobile, r.token)}`, at: r.at, name: r.name, email: r.email, phone: r.mobile, what: `Passport ${trigger.split(".")[1]} by ${r.name || r.email}`, facts: { passport: r.token } }));
      }
      break;
    }

    case "listing.live":
    case "listing.offline": {
      const live = trigger === "listing.live";
      const rows = await q<{ detail: string; at: Date }>(
        `SELECT detail, at FROM os_audit WHERE kind = 'listing_publication' AND at > $1 AND at <= $2 ORDER BY at LIMIT 200`,
        [w.since, w.until]
      ).catch(() => []);
      const hits = rows
        .map((r) => ({ id: r.detail.split(":")[0]?.trim(), went: /->\s*published/i.test(r.detail) ? "live" : / off\b|->\s*(draft|withdrawn|offline)/i.test(r.detail) ? "off" : null, at: r.at }))
        .filter((r) => r.id && r.went === (live ? "live" : "off"));
      if (!live) {
        const off = await q<{ listing_id: string; offline_at: Date }>(`SELECT listing_id, offline_at FROM os_advert_offline WHERE offline_at > $1 AND offline_at <= $2`, [w.since, w.until]).catch(() => []);
        for (const o of off) hits.push({ id: o.listing_id, went: "off", at: o.offline_at });
      }
      if (!hits.length) break;
      /* Theirs only: in their own book. */
      const { bookFor } = await import("@/lib/listings-cache");
      const book = await bookFor(rex).catch(() => null);
      const mine = new Map((book?.listings ?? []).map((l) => [String(l.id), l]));
      for (const h of hits) {
        const l = mine.get(String(h.id));
        if (!l) continue;
        out.push(subject({ key: `listing:${l.id}:${live ? "live" : "off"}:${new Date(h.at).toISOString().slice(0, 10)}`, at: h.at, address: l.name, postcode: l.postcode, listingId: l.id, propertyId: l.propertyId, what: `${l.name} ${live ? "went live" : "came off the market"}` }));
      }
      break;
    }

    case "cert.verified":
    case "cert.expiring": {
      const verified = trigger === "cert.verified";
      const days = Math.max(1, Math.min(120, Number(params.days) || 30));
      const rows = await q<{ id: string; type_id: string; expiry: string; property_id: string; property_name: string; at: Date; listing_id: string | null; landlord: Tenant | null; address: string | null; postcode: string | null }>(
        verified
          ? `SELECT c.id, c.type_id, c.expiry::text, c.property_id, c.property_name, k.at, a.listing_id, a.snapshot->'landlord' AS landlord, a.snapshot->>'address' AS address, a.snapshot->>'postcode' AS postcode
               FROM os_compliance_checks k JOIN os_certificates c ON c.id = k.subject_id
               JOIN os_tenancy_archive a ON a.property_id = c.property_id
              WHERE k.kind = 'certificate' AND k.state = 'verified' AND k.at > $1 AND k.at <= $2 AND a.agent_id = $3
              LIMIT 100`
          : `SELECT c.id, c.type_id, c.expiry::text, c.property_id, c.property_name, ${nineAm(`c.expiry - $4::int`)} AS at, a.listing_id, a.snapshot->'landlord' AS landlord, a.snapshot->>'address' AS address, a.snapshot->>'postcode' AS postcode
               FROM os_certificates c JOIN os_tenancy_archive a ON a.property_id = c.property_id
              WHERE a.agent_id = $3 AND a.last_seen > NOW() - interval '7 days'
                AND NOT EXISTS (SELECT 1 FROM os_certificates n WHERE n.replaces_id = c.id)
                AND NOT EXISTS (SELECT 1 FROM os_certificates n WHERE n.property_id = c.property_id AND n.type_id = c.type_id AND n.expiry > c.expiry)
                AND ${nineAm(`c.expiry - $4::int`)} > $1 AND ${nineAm(`c.expiry - $4::int`)} <= $2
              LIMIT 100`,
        verified ? [w.since, w.until, rex] : [w.since, w.until, rex, days]
      ).catch(() => []);
      for (const r of rows) {
        const ll = r.landlord ?? {};
        const address = r.address || r.property_name;
        const type = /gas/i.test(r.type_id) ? "gas" : /eicr|electric/i.test(r.type_id) ? "eicr" : /epc/i.test(r.type_id) ? "epc" : "other";
        out.push(subject({
          key: `cert:${r.id}`,
          at: r.at, name: ll.name ?? "", email: ll.email, phone: ll.phone, address, postcode: r.postcode, listingId: r.listing_id, propertyId: r.property_id,
          what: `${r.type_id.replace(/_/g, " ")} on ${address} ${verified ? "verified" : `expires ${new Date(r.expiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}`,
          facts: { certType: type, expiry: r.expiry },
        }));
      }
      break;
    }

    case "tenancy.move_in":
    case "tenancy.anniversary": {
      if (trigger === "tenancy.move_in") {
        const rows = await q<{ application_id: string; at: Date; packet: { tenants?: Tenant[]; property?: string; locality?: string; listingId?: string; startDate?: string } }>(
          `SELECT DISTINCT ON (h.application_id) h.application_id, ${nineAm(`(h.packet->>'startDate')::date`)} AS at, h.packet
             FROM os_handovers h
            WHERE h.packet ? 'startDate' AND (h.packet->>'startDate') ~ '^\\d{4}-\\d{2}-\\d{2}$' AND h.status IN ('ok', 'blocked')
              AND ${nameIs("h.packet->>'agent'", 3, 4)}
              AND ${nineAm(`(h.packet->>'startDate')::date`)} > $1 AND ${nineAm(`(h.packet->>'startDate')::date`)} <= $2
            ORDER BY h.application_id, h.started_at DESC`,
          [w.since, w.until, first, last]
        ).catch(() => []);
        for (const r of rows) {
          const home = [r.packet.property, r.packet.locality].filter(Boolean).join(", ");
          for (const t of r.packet.tenants ?? []) {
            out.push(subject({ key: `c:${who(t.email, t.phone, `${r.application_id}:${t.name}`)}`, at: r.at, name: t.name ?? "", email: t.email, phone: t.phone, address: home, listingId: r.packet.listingId, what: `Move-in day at ${home}` }));
          }
        }
        break;
      }
      /* The anniversary of let_since, at 9am on the day: this year's if it
         falls in the window. Homes still on the managed book only. */
      const rows = await q<{ listing_id: string | null; property_id: string; let_since: string; years: number; at: Date; tenants: Tenant[] | null; address: string | null; postcode: string | null }>(
        `SELECT a.listing_id, a.property_id, a.let_since::text, y.years, ${nineAm(`(a.let_since + make_interval(years => y.years))::date`)} AS at,
                a.snapshot->'tenants' AS tenants, a.snapshot->>'address' AS address, a.snapshot->>'postcode' AS postcode
           FROM os_tenancy_archive a
           CROSS JOIN LATERAL (SELECT (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM a.let_since))::int AS years) y
          WHERE a.agent_id = $3 AND a.let_since IS NOT NULL AND y.years >= 1 AND a.last_seen > NOW() - interval '7 days'
            AND ${nineAm(`(a.let_since + make_interval(years => y.years))::date`)} > $1
            AND ${nineAm(`(a.let_since + make_interval(years => y.years))::date`)} <= $2`,
        [w.since, w.until, rex]
      ).catch(() => []);
      for (const r of rows) {
        for (const t of r.tenants ?? []) {
          out.push(subject({ key: `c:${who(t.email, t.phone, `${r.property_id}:${t.name}`)}:${r.years}y`, at: r.at, name: t.name ?? "", email: t.email, phone: t.phone, address: r.address ?? "", postcode: r.postcode, listingId: r.listing_id, propertyId: r.property_id, what: `${r.years} year${r.years === 1 ? "" : "s"} at ${r.address}` }));
        }
      }
      break;
    }

    case "schedule":
      /* Asked by the runner from next_at, never from a window. */
      break;
  }
  return out;
}

/* ── Conditions, checked when the wait is over ───────────────────────────── */


/** Null when it holds, otherwise why it does not - in a sentence for the log. */
export async function conditionFails(c: Step<ConditionKey>, s: Subject, owner: OsUser): Promise<string | null> {
  const email = (s.email ?? "").trim().toLowerCase();
  switch (c.key) {
    case "has_email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "They have no email address.";
    case "has_mobile": {
      const { smsNumber } = await import("@/lib/sms");
      return smsNumber(s.phone) ? null : "They have no mobile number.";
    }
    case "no_viewing_booked": {
      if (!email && !s.phone) return null;
      const phone = (s.phone ?? "").replace(/\D/g, "").slice(-10);
      const rows = await q<{ id: string }>(
        `SELECT v.id FROM os_viewings v
          WHERE v.kind = 'viewing' AND NOT v.cancelled AND v.first_seen > $3::timestamptz - interval '1 hour'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.contacts) x
                         WHERE ($1 <> '' AND LOWER(x->>'email') = $1)
                            OR ($2 <> '' AND RIGHT(regexp_replace(COALESCE(x->>'phone', ''), '\\D', '', 'g'), 10) = $2))
          LIMIT 1`,
        [email, phone, s.at]
      ).catch(() => []);
      const os = await q<{ id: string }>(
        `SELECT id FROM os_appointments WHERE kind = 'viewing' AND cancelled_at IS NULL AND created_at > $2 AND LOWER(COALESCE(contact_email, '')) = $1 AND $1 <> '' LIMIT 1`,
        [email, s.at]
      ).catch(() => []);
      return rows.length || os.length ? "They booked a viewing, so it wasn't needed." : null;
    }
    case "passport_not_finished": {
      if (!email) return null;
      const rows = await q<{ token: string }>(`SELECT token FROM os_tenant_passports WHERE LOWER(email) = $1 AND submitted_at IS NOT NULL LIMIT 1`, [email]).catch(() => []);
      return rows.length ? "Their passport is finished, so it wasn't needed." : null;
    }
    case "listing_still_available": {
      if (!s.listingId) return null;
      const { bookFor } = await import("@/lib/listings-cache");
      const book = await bookFor(owner.rexUserId ?? "\u0000").catch(() => null);
      const l = book?.listings.find((x) => String(x.id) === s.listingId);
      if (!book) return null;
      if (!l || l.letAgreed || l.publicationStatus !== "published") return "The home isn't on the market any more.";
      return null;
    }
    case "source_is": {
      const want = String(c.params.source ?? "").trim().toLowerCase();
      return !want || String(s.facts.source ?? "").toLowerCase().includes(want) ? null : `The lead came from ${s.facts.source || "somewhere else"}.`;
    }
    case "postcode_starts": {
      const want = String(c.params.prefix ?? "").replace(/\s/g, "").toUpperCase();
      const pc = (s.postcode ?? "").replace(/\s/g, "").toUpperCase();
      return !want || pc.startsWith(want) ? null : `The home is in ${s.postcode || "another area"}.`;
    }
    case "cert_type": {
      const want = String(c.params.type ?? "gas");
      return (s.facts.certType ?? "other") === want ? null : "It's a different certificate.";
    }
  }
  return null;
}
