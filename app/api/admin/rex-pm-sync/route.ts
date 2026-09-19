import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { requireCapability } from "@/lib/admin";
import { matchProperty } from "@/lib/property-match";
import { createProperty } from "@/lib/rex-properties";
import { splitAddress } from "@/lib/rex-instruct";
import { writeCertificateRow } from "@/lib/certificate-intake";

/**
 * THE REX HALF OF "EVERYTHING IN BOTH" (Susan, 19 Sep 2026; James: "do the
 * REX half first"). Every managed home the OS holds that REX CRM does not -
 * the "Not on REX" homes from REX PM - goes into REX, and its certificates
 * follow, so REX PM can be dropped.
 *
 * Per home, the same rule the instruction sweep uses (lib/rex-instruct), made
 * stricter for a bulk run:
 *
 *   confident match in REX   link it; nothing is created
 *   check                    held for James, with the candidates
 *   no match, but REX has    held too - a bulk run does not guess past a
 *   homes at the postcode    neighbour that might be the same flat
 *   nothing at the postcode  created in REX, under the signed-in owner
 *
 * Then its certificates are moved from the pm- id to the REX property and
 * written into REX's compliance tab (lib/certificate-intake), the same path
 * the backlog used.
 *
 *   GET                         the plan, nothing written
 *   POST { limit, ids? }        do the next `limit` homes (default 10)
 *
 * Owners only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Home = { id: string; ref: string; address: string; postcode: string | null };
type Plan = { id: string; ref: string; address: string; action: "link" | "create" | "hold"; why: string; rexId: string | null; candidates: string[] };

const lettings = (list: { id: string; name: string }[]) => list.filter((t) => /^\d+$/.test(t.id));

async function homes(ids?: string[]): Promise<Home[]> {
  return q<Home>(
    `SELECT id, ref, address, postcode FROM os_properties
      WHERE active AND rex_property_id IS NULL ${ids?.length ? "AND id = ANY($1)" : ""}
      ORDER BY address`,
    ids?.length ? [ids] : []
  );
}

async function planFor(h: Home): Promise<Plan> {
  const full = h.postcode && !h.address.toUpperCase().includes(h.postcode.toUpperCase()) ? `${h.address}, ${h.postcode}` : h.address;
  const base = { id: h.id, ref: h.ref, address: full };
  const m = await matchProperty(full).catch(() => null);
  if (!m) return { ...base, action: "hold", why: "REX could not be asked just now", rexId: null, candidates: [] };
  const targets = lettings(m.targets);
  const possible = lettings(m.possible ?? []);
  if (m.verdict === "confident" && targets.length === 1) {
    return { ...base, action: "link", why: `already in REX (${m.how})`, rexId: targets[0].id, candidates: targets.map((t) => t.name) };
  }
  if (targets.length || possible.length) {
    return { ...base, action: "hold", why: m.verdict === "confident" ? `REX holds ${targets.length} records that fit` : `REX may hold it (${m.how})`, rexId: null, candidates: [...targets, ...possible].map((t) => `${t.name} [${t.id}]`) };
  }
  if (m.how === "no postcode on the address") return { ...base, action: "hold", why: "no postcode", rexId: null, candidates: [] };
  return { ...base, action: "create", why: "nothing in REX at this postcode", rexId: null, candidates: [] };
}

/** Its certificates onto the REX property, then into REX's compliance tab. */
async function moveCertificates(pmId: string, rexId: string): Promise<{ moved: number; written: number; notes: string[] }> {
  const rows = await q<Parameters<typeof writeCertificateRow>[0]>(
    `UPDATE os_certificates SET property_id = $2, rex_note = '' WHERE property_id = $1 RETURNING *`,
    [pmId, rexId]
  );
  let written = 0;
  const notes: string[] = [];
  for (const r of rows) {
    const w = await writeCertificateRow(r, "REX PM record, synced 19 Sep 2026").catch((e) => ({ ...r, rex_entry_id: null, rex_note: e instanceof Error ? e.message : "failed" }));
    if (w.rex_entry_id) written++;
    else if (w.rex_note) notes.push(`${r.type_id}: ${w.rex_note}`);
  }
  return { moved: rows.length, written, notes: [...new Set(notes)] };
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me || me.role !== "owner") return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const list = await homes();
  const plan: Plan[] = [];
  for (const h of list) plan.push(await planFor(h));
  const count = (a: Plan["action"]) => plan.filter((p) => p.action === a).length;
  return NextResponse.json({ ok: true, homes: plan.length, link: count("link"), create: count("create"), hold: count("hold"), plan });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me || me.role !== "owner") return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { limit?: number; ids?: string[] };
  const limit = Math.max(1, Math.min(25, Number(b.limit) || 10));

  const done: Array<Plan & { outcome: string; certificates?: { moved: number; written: number; notes: string[] } }> = [];
  let tried = 0;
  for (const h of await homes(b.ids)) {
    if (tried >= limit) break;
    const p = await planFor(h);
    if (p.action === "hold") continue;
    tried++;
    let rexId = p.rexId;
    let outcome = "";
    if (p.action === "create") {
      const made = await createProperty(splitAddress(h.address, h.postcode), me.id);
      if (!made.ok) {
        done.push({ ...p, outcome: `not created: ${made.ownerDetail ?? made.detail}` });
        /* A refusal that will refuse every home (switch, session) stops the run. */
        if (["switch_off", "writes_locked", "no_rex_session", "rex_session_expired", "rex_not_configured"].includes(made.reason)) break;
        continue;
      }
      rexId = made.propertyId;
      outcome = `created in REX as ${rexId}`;
    } else {
      outcome = `linked to REX ${rexId}`;
    }
    await q(`UPDATE os_properties SET rex_property_id = $2, match_how = $3, updated_at = NOW() WHERE id = $1`, [h.id, rexId, p.action === "create" ? "created in REX by the sync, 19 Sep 2026" : `sync: ${p.why}`]);
    const certificates = await moveCertificates(h.id, rexId!);
    done.push({ ...p, rexId, outcome, certificates });
  }
  const left = (await homes()).length;
  return NextResponse.json({ ok: true, done, stillNotOnRex: left });
}
