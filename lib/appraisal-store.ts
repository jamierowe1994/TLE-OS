import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { hasDb, q } from "@/lib/db";
import { DATA_DIR } from "@/lib/business/data-dir";
import type { MarketAppraisal, MaStage } from "@/lib/market-appraisal";
import { mergeAddress } from "@/lib/appraisal-address";
import { postcodeIn } from "@/lib/postcode";

/**
 * The appraisals the OS has actually booked.
 *
 * ── What this exists to fix ───────────────────────────────────────────────
 *
 * Booking an appraisal from a landlord lead pushed the agent to
 * `/market-appraisals?open=lead-<id>`, and that screen only ever opened the
 * four hardcoded samples. So the handover — the whole point of the landlord
 * spine — navigated to a list with nothing selected and no sign anything had
 * happened. The gesture worked; nothing was recorded.
 *
 * Nothing was recorded because there was nowhere to record it. There was no
 * appraisal store at all: `SAMPLE_APPRAISALS` was the entire dataset the three
 * appraisal screens read. This is that missing half.
 *
 * ── Dual backend, like the other stores ───────────────────────────────────
 *
 * Postgres when DATABASE_URL is set, a JSON file under DATA_DIR when it is not
 * — the same shape as lib/business/knowledge-store. Two reasons it matters
 * here specifically: the pilot laptops may run without a database, and a
 * booking that throws because there is no Postgres would lose the appointment
 * an agent just agreed with a landlord on the phone.
 *
 * ── Idempotent on the lead ────────────────────────────────────────────────
 *
 * `id` is `lead-<leadId>`, so booking the same lead twice MOVES the
 * appointment instead of creating a second appraisal for the same property.
 * An agent who books, gets the day wrong and books again should end up with
 * one correct appraisal, not two half-right ones — and the handover URL stays
 * the same either way, which is why the existing links keep working.
 */

const FILE = path.join(DATA_DIR, "market-appraisals.json");


export interface NewAppraisal {
  leadId: string | null;
  landlord: string;
  address: string;
  postcode?: string;
  agent?: string | null;
  /** ISO. Null is allowed and shows on the screen as a defect worth chasing. */
  appointmentAt?: string | null;
}

interface Row extends Record<string, unknown> {
  id: string;
  lead_id: string | null;
  landlord: string;
  address: string;
  postcode: string;
  agent: string | null;
  appointment_at: string | Date | null;
  stage: string;
  valuation: number | null;
  service_level: string | null;
  /* pg returns NUMERIC as a STRING, not a number — it will not fit in a float
     without losing precision, so node-postgres declines to guess. Typed as it
     actually arrives and converted once, in rowTo. */
  fee_pct: string | number | null;
  setup_fee: number | null;
  valuation_note: string | null;
  valued_at: string | Date | null;
  valued_by: string | null;
  present_token: string | null;
  created_at: string | Date;
}

/** Every column the reads select, in one place so they cannot drift apart. */
const COLS = `id, lead_id, landlord, address, postcode, agent, appointment_at,
              stage, valuation, service_level, fee_pct, setup_fee,
              valuation_note, valued_at, valued_by, present_token, created_at`;

function rowTo(r: Row): MarketAppraisal {
  return {
    id: r.id,
    leadId: r.lead_id,
    landlord: r.landlord,
    address: r.address,
    /* Rows written before this healed themselves have an empty postcode and a
       full address. Reading it here means the fix applies backwards without a
       migration, and a migration that rewrites live rows to fix a display bug
       is a bigger risk than the bug. */
    postcode: r.postcode || postcodeIn(r.address ?? ""),
    agent: r.agent,
    appointmentAt: r.appointment_at ? new Date(r.appointment_at).toISOString() : null,
    stage: r.stage as MaStage,
    valuation: r.valuation,
    serviceLevel: (r.service_level as MarketAppraisal["serviceLevel"]) ?? null,
    /* String out of pg, number everywhere else. Number("") is 0 and would turn
       a blank fee into a real 0%, so the empty case is checked first. */
    feePct:
      r.fee_pct == null || r.fee_pct === "" ? null : Number(r.fee_pct),
    setupFee: r.setup_fee,
    valuationNote: r.valuation_note,
    valuedAt: r.valued_at ? new Date(r.valued_at).toISOString() : null,
    valuedBy: r.valued_by,
    presentToken: r.present_token,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

async function readFile(): Promise<MarketAppraisal[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* FILLED IN, not cast. Rows written before the terms fields existed simply
       have no such keys, so a bare cast would hand back `undefined` from a
       property the type promises is `ServiceLevel | null` — and `undefined` is
       exactly what recordValuation reads as "not sent, leave alone". A legacy
       row would then be unclearable. The DB path gets this for free because a
       missing column reads as NULL; the file path has to say so. */
    return (parsed as Partial<MarketAppraisal>[]).map((r) => ({
      ...(r as MarketAppraisal),
      serviceLevel: r.serviceLevel ?? null,
      feePct: r.feePct ?? null,
      setupFee: r.setupFee ?? null,
      valuationNote: r.valuationNote ?? null,
      valuedAt: r.valuedAt ?? null,
      valuedBy: r.valuedBy ?? null,
    }));
  } catch {
    /* No file yet is the normal state before the first booking, not an error. */
    return [];
  }
}

async function writeFile(rows: MarketAppraisal[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

/** The id an appraisal for this lead has, whether or not it exists yet. */
export function appraisalIdForLead(leadId: string): string {
  return `lead-${leadId}`;
}

/** Every appraisal the OS holds, newest first. */
/**
 * THE LEAD OWNS THE ADDRESS. The appraisal keeps a copy, not the truth.
 *
 * Booking writes the lead's address onto the appraisal, and from that moment
 * the two could disagree. James corrected his own address in Leads and the
 * open appraisal carried on showing the old one, because nothing ever went
 * back for it. A record that was right when it was written and silently wrong
 * afterwards is the same failure this project keeps hitting from a different
 * direction.
 *
 * Fixed by DERIVING rather than syncing. A write-through on save would need to
 * find every appraisal, succeed every time, and never be skipped by an edit
 * made anywhere else; this cannot drift because there is only ever one answer
 * and it is fetched when asked for.
 *
 * Only for appraisals booked from an OS lead — those carry `os-<contactId>`.
 * An appraisal created directly has no lead behind it, so its own copy IS the
 * truth and is left alone.
 *
 * The stored copy stays as the fallback. If the contact has been deleted, or
 * has no address on it, the appraisal keeps what it was booked with rather
 * than blanking a property out from under an agent.
 */
async function withLiveAddress(rows: MarketAppraisal[]): Promise<MarketAppraisal[]> {
  const { isOsLead, osContactIdFrom } = await import("@/lib/contacts-as-leads");
  const linked = rows.filter((r) => r.leadId && isOsLead(r.leadId));
  if (!linked.length) return rows;

  const { getContact } = await import("@/lib/contacts-store");
  const live = new Map<string, { address: string; postcode: string }>();
  await Promise.all(
    [...new Set(linked.map((r) => r.leadId!))].map(async (leadId) => {
      try {
        const c = await getContact(osContactIdFrom(leadId));
        if (c) live.set(leadId, { address: c.address ?? "", postcode: c.postcode ?? "" });
      } catch {
        /* One unreachable contact must not blank a whole list of appraisals. */
      }
    })
  );

  /* The rule itself is in lib/appraisal-address, pure and tested. */
  return rows.map((r) => mergeAddress(r, r.leadId ? live.get(r.leadId) : null));
}

export async function listAppraisals(): Promise<MarketAppraisal[]> {
  if (hasDb()) {
    const rows = await q<Row>(
      `SELECT ${COLS}
         FROM os_market_appraisals
        ORDER BY created_at DESC`
    );
    return withLiveAddress(rows.map(rowTo));
  }
  const rows = await readFile();
  /* Both backends, or the pilot laptops behave differently from Railway and
     the difference only shows up in front of a landlord. */
  return withLiveAddress(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function getAppraisal(id: string): Promise<MarketAppraisal | null> {
  if (hasDb()) {
    const rows = await q<Row>(
      `SELECT ${COLS}
         FROM os_market_appraisals WHERE id = $1`,
      [id]
    );
    return rows[0] ? (await withLiveAddress([rowTo(rows[0])]))[0] : null;
  }
  const one = (await readFile()).find((r) => r.id === id);
  return one ? (await withLiveAddress([one]))[0] : null;
}

/**
 * Book one, or move the one this lead already has.
 *
 * Only the appointment and the details that come off the lead are written on a
 * repeat booking. Stage, valuation and the presentation token are deliberately
 * left alone: re-booking a visit is not a reason to throw away a figure
 * somebody recorded or a deck they built.
 */
/** What an agent can write after the visit. Every field optional — see below. */
export interface ValuationPatch {
  valuation?: number | null;
  serviceLevel?: MarketAppraisal["serviceLevel"];
  feePct?: number | null;
  setupFee?: number | null;
  valuationNote?: string | null;
}

/**
 * RECORD THE FIGURE. The first UPDATE this table has ever had.
 *
 * `os_market_appraisals.valuation` shipped weeks ago and had no writer
 * anywhere in the repo — no UPDATE, no PATCH — so it was permanently NULL, and
 * with it every stage past `booked` was unreachable and the "awaiting
 * valuation" flag could never be cleared. The button that claimed to do this
 * pointed at `?open=<id>`, which redirected straight back to the page it was
 * clicked on.
 *
 * ── Why a partial patch, and not a form that demands everything ───────────
 *
 * An agent does this standing in a hallway or sitting in a car. They will
 * often have the rent and not yet the fee. `undefined` means "not sent, leave
 * it alone"; `null` means "clear it" — and the two must stay distinct, or
 * saving a rent on its own would wipe a service level agreed ten minutes
 * earlier.
 *
 * ── The stage moves itself ────────────────────────────────────────────────
 *
 * Nothing here writes `stage`. effectiveStage() already reports post_appraisal
 * once a valuation exists, so a stored stage would be a second answer to a
 * question that already has one — and the two would disagree the first time
 * anybody edited a figure back to null.
 */
export async function recordValuation(
  id: string,
  patch: ValuationPatch,
  by: string
): Promise<MarketAppraisal | null> {
  const has = <K extends keyof ValuationPatch>(k: K) => patch[k] !== undefined;

  /* Nothing to write is not an error, but it must not stamp valuedAt/valuedBy
     as though somebody had recorded something. */
  if (!Object.keys(patch).some((k) => patch[k as keyof ValuationPatch] !== undefined)) {
    return getAppraisal(id);
  }

  const now = new Date().toISOString();

  if (hasDb()) {
    /* COALESCE would be wrong here: it cannot express "set this to null",
       which is how a figure entered by mistake gets taken back off a landlord's
       deck. So the SET list is built from what was actually sent. */
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const put = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (has("valuation")) put("valuation", patch.valuation ?? null);
    if (has("serviceLevel")) put("service_level", patch.serviceLevel ?? null);
    if (has("feePct")) put("fee_pct", patch.feePct ?? null);
    if (has("setupFee")) put("setup_fee", patch.setupFee ?? null);
    if (has("valuationNote")) put("valuation_note", patch.valuationNote ?? null);
    put("valued_by", by);
    sets.push("valued_at = NOW()", "updated_at = NOW()");

    const rows = await q<Row>(
      `UPDATE os_market_appraisals SET ${sets.join(", ")}
        WHERE id = $1
        RETURNING ${COLS}`,
      vals
    );
    return rows[0] ? (await withLiveAddress([rowTo(rows[0])]))[0] : null;
  }

  /* File fallback, and it is not a courtesy — the pilot laptops run without a
     database, and this is the one write an agent makes away from a desk. */
  const all = await readFile();
  const i = all.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const next: MarketAppraisal = {
    ...all[i],
    ...(has("valuation") ? { valuation: patch.valuation ?? null } : {}),
    ...(has("serviceLevel") ? { serviceLevel: patch.serviceLevel ?? null } : {}),
    ...(has("feePct") ? { feePct: patch.feePct ?? null } : {}),
    ...(has("setupFee") ? { setupFee: patch.setupFee ?? null } : {}),
    ...(has("valuationNote") ? { valuationNote: patch.valuationNote ?? null } : {}),
    valuedAt: now,
    valuedBy: by,
  };
  all[i] = next;
  await writeFile(all);
  return (await withLiveAddress([next]))[0];
}

export async function createAppraisal(input: NewAppraisal): Promise<MarketAppraisal> {
  const landlord = input.landlord.trim();
  const address = input.address.trim();
  if (!landlord || !address) {
    throw new Error("An appraisal needs a landlord and an address.");
  }

  const now = new Date().toISOString();
  const appraisal: MarketAppraisal = {
    id: input.leadId ? appraisalIdForLead(input.leadId) : `ma-${crypto.randomUUID()}`,
    leadId: input.leadId,
    landlord,
    address,
    /* Given one, trust it. Given none, read the address rather than shrug. */
    postcode: (input.postcode ?? "").trim() || postcodeIn(input.address ?? ""),
    agent: input.agent?.trim() || null,
    appointmentAt: input.appointmentAt ?? null,
    /* Booked, not pre-appraisal. The record IS just booked — the research and
       the deck have not happened — and creating straight into Pre-appraisal
       would leave the Booked stage as a box that only ever reads zero, which
       is the exact failure MA_STAGES was thinned to avoid. */
    stage: "booked",
    valuation: null,
    /* A new booking has no terms yet, and these must be null rather than
       absent: the JSON file is read straight back as a MarketAppraisal, so a
       missing key would read as undefined and defeat the "sent or not sent"
       distinction recordValuation depends on. */
    serviceLevel: null,
    feePct: null,
    setupFee: null,
    valuationNote: null,
    valuedAt: null,
    valuedBy: null,
    presentToken: null,
    createdAt: now,
  };

  if (hasDb()) {
    const rows = await q<Row>(
      `INSERT INTO os_market_appraisals
         (id, lead_id, landlord, address, postcode, agent, appointment_at, stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
       ON CONFLICT (id) DO UPDATE SET
         landlord       = EXCLUDED.landlord,
         address        = EXCLUDED.address,
         postcode       = EXCLUDED.postcode,
         agent          = EXCLUDED.agent,
         appointment_at = EXCLUDED.appointment_at,
         updated_at     = NOW()
       RETURNING ${COLS}`,
      [
        appraisal.id,
        appraisal.leadId,
        appraisal.landlord,
        appraisal.address,
        appraisal.postcode,
        appraisal.agent,
        appraisal.appointmentAt,
      ]
    );
    return rowTo(rows[0]);
  }

  const rows = await readFile();
  const idx = rows.findIndex((r) => r.id === appraisal.id);
  if (idx >= 0) {
    /* Same rule as the upsert above: move the appointment, keep the work. */
    rows[idx] = {
      ...rows[idx],
      landlord: appraisal.landlord,
      address: appraisal.address,
      postcode: appraisal.postcode,
      agent: appraisal.agent,
      appointmentAt: appraisal.appointmentAt,
    };
    await writeFile(rows);
    return rows[idx];
  }
  rows.push(appraisal);
  await writeFile(rows);
  return appraisal;
}
