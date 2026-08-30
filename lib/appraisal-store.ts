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
  present_token: string | null;
  created_at: string | Date;
}

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
    presentToken: r.present_token,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

async function readFile(): Promise<MarketAppraisal[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MarketAppraisal[]) : [];
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
      `SELECT id, lead_id, landlord, address, postcode, agent, appointment_at,
              stage, valuation, present_token, created_at
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
      `SELECT id, lead_id, landlord, address, postcode, agent, appointment_at,
              stage, valuation, present_token, created_at
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
       RETURNING id, lead_id, landlord, address, postcode, agent, appointment_at,
                 stage, valuation, present_token, created_at`,
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
