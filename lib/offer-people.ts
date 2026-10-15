import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { cleanPerson, missingFrom, personLines, type OfferPart, type OtherAdult, type PersonAnswers } from "@/lib/offer-people-shape";

/**
 * THE OTHER ADULTS ON AN OFFER, KEPT (James, 14 Oct 2026; the questions and
 * why are in lib/offer-people-shape).
 *
 * One row per adult beyond the lead, against the offer they are on
 * (os_tenant_viewing_responses.id). Each row has its own token: the link the
 * lead or the agent copies and sends, so that person can fill in their own
 * part without an account. A part filled in by the lead or the agent is
 * stored the same way, with who filled it in.
 *
 * Nothing here emails anybody or writes to REX or Propoly. The people reach
 * Propoly when the accepted offer becomes an application (lib/applications)
 * and is pushed, like any applicant.
 */

export type OfferPerson = {
  token: string;
  offerId: string;
  name: string;
  answers: PersonAnswers;
  filled: boolean;
  filledBy: "lead" | "self" | "agent" | null;
  filledAt: string | null;
  createdAt: string;
};

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_offer_people (
      token      TEXT PRIMARY KEY,
      offer_id   TEXT NOT NULL,
      listing_id TEXT,
      property   TEXT NOT NULL DEFAULT '',
      lead_name  TEXT NOT NULL DEFAULT '',
      name       TEXT NOT NULL DEFAULT '',
      answers    JSONB NOT NULL DEFAULT '{}',
      filled_by  TEXT,
      filled_at  TIMESTAMPTZ,
      by_name    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_offer_people_offer ON os_offer_people (offer_id)`))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Row = { token: string; offer_id: string; name: string; answers: PersonAnswers; filled_by: string | null; filled_at: Date | null; created_at: Date; listing_id?: string | null; property?: string; lead_name?: string };
const shape = (r: Row): OfferPerson => ({
  token: r.token,
  offerId: r.offer_id,
  name: r.name,
  answers: cleanPerson(r.answers),
  filled: Boolean(r.filled_at),
  filledBy: r.filled_by === "lead" || r.filled_by === "self" || r.filled_by === "agent" ? r.filled_by : null,
  filledAt: r.filled_at ? new Date(r.filled_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
});

const newToken = () => randomBytes(16).toString("base64url");

/**
 * The other adults sent with an offer. A part filled in now must be complete;
 * one left for a link needs only the name. Returns what to tell the sender:
 * the reason a part was refused, or the rows made.
 */
export function checkOthers(raw: unknown): { ok: true; others: OtherAdult[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw.slice(0, 8) : [];
  const others: OtherAdult[] = [];
  for (const item of list) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const answers = cleanPerson(r.answers);
    const mode = r.mode === "fill" ? "fill" : "link";
    const who = answers.name || "the other adult";
    if (answers.name.split(/\s+/).filter(Boolean).length < 2) return { ok: false, error: `Give ${who === "the other adult" ? "each adult" : who} a full name, first and last.` };
    if (mode === "fill") {
      const gaps = missingFrom(answers);
      if (gaps.length) return { ok: false, error: `For ${who}, still needed: ${gaps.join(", ")}.` };
    }
    others.push({ mode, answers });
  }
  return { ok: true, others };
}

export async function addOfferPeople(p: { offerId: string; listingId: string | null; property: string; leadName: string; others: OtherAdult[]; filledBy: "lead" | "agent"; byName: string }): Promise<OfferPerson[]> {
  if (!hasDb() || !p.others.length) return [];
  const out: OfferPerson[] = [];
  for (const o of p.others) {
    const filled = o.mode === "fill";
    const rows = await tq<Row>(
      `INSERT INTO os_offer_people (token, offer_id, listing_id, property, lead_name, name, answers, filled_by, filled_at, by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *`,
      [newToken(), p.offerId, p.listingId, p.property, p.leadName, o.answers.name, JSON.stringify(o.answers), filled ? p.filledBy : null, filled ? new Date() : null, filled ? p.byName : null]
    );
    out.push(shape(rows[0]));
  }
  return out;
}

export async function offerPeople(offerIds: string[]): Promise<Map<string, OfferPerson[]>> {
  const map = new Map<string, OfferPerson[]>();
  if (!hasDb() || !offerIds.length) return map;
  const rows = await tq<Row>(`SELECT * FROM os_offer_people WHERE offer_id = ANY($1) ORDER BY created_at, name`, [offerIds]).catch(() => [] as Row[]);
  for (const r of rows) map.set(r.offer_id, [...(map.get(r.offer_id) ?? []), shape(r)]);
  return map;
}

export async function offerPersonByToken(token: string): Promise<(OfferPerson & { property: string; leadName: string; listingId: string | null }) | null> {
  if (!hasDb() || !/^[\w-]{16,40}$/.test(token)) return null;
  const rows = await tq<Row>(`SELECT * FROM os_offer_people WHERE token = $1`, [token]).catch(() => [] as Row[]);
  const r = rows[0];
  return r ? { ...shape(r), property: r.property ?? "", leadName: r.lead_name ?? "", listingId: r.listing_id ?? null } : null;
}

/** Their part, filled in by them (from the link) or by the agent for them. */
export async function fillOfferPerson(token: string, answers: PersonAnswers, by: { kind: "self" | "agent"; name: string }): Promise<OfferPerson | null> {
  const rows = await tq<Row>(
    `UPDATE os_offer_people SET answers = $2::jsonb, name = $3, filled_by = $4, filled_at = NOW(), by_name = $5 WHERE token = $1 RETURNING *`,
    [token, JSON.stringify(answers), answers.name, by.kind, by.name]
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** The parts as the agent's screens show them. */
export function toOfferParts(list: OfferPerson[], leadName: string): OfferPart[] {
  return list.map((m) => ({
    name: m.name,
    filled: m.filled,
    by: m.filledBy === "self" ? "Filled in by them" : m.filledBy === "agent" ? "Filled in by the agent" : m.filledBy === "lead" ? `Filled in by ${(leadName || "the lead tenant").split(/\s+/)[0]}` : null,
    lines: m.filled ? personLines(m.answers) : [],
    link: partLink(m.token),
  }));
}

/** The link that person fills their part in at. */
export function partLink(token: string): string {
  return `${(process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "")}/tenant/offer-part/${encodeURIComponent(token)}`;
}
