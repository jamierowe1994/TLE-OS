import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { requireCapability } from "@/lib/admin";

/**
 * REX PM's managed list, landed on the OS property record (2 Oct 2026).
 *
 * REX PM's Properties screen, Active letting agreement tab, is the 527 its
 * dashboard calls Managed. It is read off the screen in James's browser (REX
 * refused API access) and posted here:
 *
 *   POST { homes: [{ id, occupied, upcoming, service, address? }], complete }
 *
 *   id        REX PM's property uuid (os_properties holds it as pm-<uuid>)
 *   occupied  its Tenancy Status says Occupied (otherwise Vacant)
 *   upcoming  on its Upcoming vacancies tab
 *   service   its Service package, as printed
 *   address   the full address, needed only for a home the OS has not seen
 *
 * `complete` says the whole tab was read, so a REX PM home missing from it is
 * no longer managed there: pm_managed false. Only the pm_ columns are touched -
 * `active` and `management` belong to the clean sweep and Compliance reads
 * them - and homes from Susan's PayProp sheet are left alone.
 * The managed book (lib/managed-book) is the pm_managed homes from then on.
 *
 * GET → the counts as they stand. Owners only. Nothing here talks to REX PM.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Home = { id: string; occupied: boolean; upcoming?: boolean; service?: string; address?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const postcodeOf = (a: string) => a.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}(?=\s*$)/)?.[0] ?? null;

async function counts() {
  const [r] = await q<Record<string, string>>(
    `SELECT COUNT(*) FILTER (WHERE pm_managed)::text AS managed,
            COUNT(*) FILTER (WHERE pm_managed AND pm_status = 'occupied')::text AS occupied,
            COUNT(*) FILTER (WHERE pm_managed AND pm_status = 'vacant')::text AS vacant,
            COUNT(*) FILTER (WHERE pm_managed AND pm_upcoming_vacancy)::text AS upcoming,
            COUNT(*) FILTER (WHERE pm_managed AND (rex_property_id IS NULL OR rex_property_id = ''))::text AS not_on_rex,
            MAX(pm_read_at) AS read_at
       FROM os_properties`
  );
  return { managed: Number(r.managed), occupied: Number(r.occupied), vacant: Number(r.vacant), upcoming: Number(r.upcoming), notOnRex: Number(r.not_on_rex), readAt: r.read_at };
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await counts()) });
}

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { homes?: Home[]; complete?: boolean } | null;
  const homes = (b?.homes ?? []).filter((h) => h && uuid.test(String(h.id)));
  if (!homes.length) return NextResponse.json({ ok: false, error: "No homes to land." }, { status: 400 });

  let updated = 0;
  const added: string[] = [];
  const missing: string[] = [];
  for (const h of homes) {
    const id = `pm-${h.id.toLowerCase()}`;
    const status = h.occupied ? "occupied" : "vacant";
    const service = (h.service ?? "").trim() || null;
    const rows = await q<{ id: string }>(
      `UPDATE os_properties SET pm_managed = TRUE, pm_status = $2, pm_upcoming_vacancy = $3, pm_service = $4, pm_read_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [id, status, h.upcoming === true, service]
    );
    if (rows.length) { updated += 1; continue; }
    const address = (h.address ?? "").trim();
    if (!address) { missing.push(h.id); continue; }
    /* A home new to the OS: added as REX PM has it. Not linked to REX CRM yet -
       it joins the book as Not on REX until the property sync links it. */
    const parts = address.split(",").map((x) => x.trim()).filter(Boolean);
    const postcode = postcodeOf(address);
    const town = parts.length > 2 ? parts[parts.length - 2] : null;
    await q(
      `INSERT INTO os_properties (id, source, ref, address, name, locality, postcode, town, management, active, service_level,
                                  pm_managed, pm_status, pm_upcoming_vacancy, pm_service, pm_read_at)
       VALUES ($1, 'rex-pm', '', $2, $3, $4, $5, $6, 'Active letting agreement', TRUE, $7, TRUE, $8, $9, $10, NOW())`,
      [id, address, parts.slice(0, 2).join(", "), [town, postcode].filter(Boolean).join(" "), postcode, town,
       service && /tenant find/i.test(service) ? "market_only" : service && /rent collect/i.test(service) ? "rent_collect" : "managed", status, h.upcoming === true, service]
    );
    added.push(address);
  }

  let ended: string[] = [];
  if (b?.complete === true && !missing.length) {
    const ids = homes.map((h) => `pm-${h.id.toLowerCase()}`);
    const rows = await q<{ address: string }>(
      `UPDATE os_properties SET pm_managed = FALSE, pm_upcoming_vacancy = FALSE, pm_read_at = NOW(), updated_at = NOW()
        WHERE source = 'rex-pm' AND NOT (id = ANY($1)) AND pm_managed IS DISTINCT FROM FALSE
        RETURNING address`,
      [ids]
    );
    ended = rows.map((r) => r.address);
  }
  return NextResponse.json({ ok: true, updated, added, ended, missing, ...(await counts()) });
}
