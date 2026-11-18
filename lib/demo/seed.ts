import "server-only";
import { hashPassword } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { AREA_DEFS } from "@/lib/area-map";
import { READY_PREF } from "@/lib/launch";
import { LOOK_SCREENS } from "@/lib/new-look";
import { connectDemoRex } from "@/lib/rex-user";
import { demoMode } from "./mode";
import { demoWorld, resetDemoWorld } from "./world";

/**
 * THE DEMO'S OWN DATABASE, SET UP (lib/demo/mode).
 *
 * The demo service starts on an empty database. lib/db builds the tables, as
 * it does anywhere; this adds the few rows a person needs to walk in:
 *
 *   - a sign-in for each invented member of staff (lib/demo/world-data STAFF),
 *     all on one shared password, DEMO_PASSWORD, which James sets on the demo
 *     service and gives to whoever is showing it. No DEMO_PASSWORD, no
 *     sign-ins: there is no built-in password to guess.
 *   - first-run set-up marked done, so nobody showing it meets the wizard
 *   - every area open, so the whole system is on show
 *
 * Idempotent: run at every boot and by the nightly reset. It never touches a
 * database unless DEMO_MODE=1, checked here as well as by its callers, so it
 * cannot run against live by being imported from the wrong place.
 */

const ROLE = { agent: "agent", office: "super_admin", owner: "owner" } as const;

/** Where the demo reads the team's look from. The live system, unless DEMO_LOOK_SOURCE says otherwise. */
export const lookSource = () => (process.env.DEMO_LOOK_SOURCE || "https://tle-os.co.uk").replace(/\/+$/, "");

const LOOK_ON_18_NOV = [
  "admin", "advert", "application", "applications", "appraisal", "appraisals", "booking", "builder", "compliance", "contractors", "dashboard", "diary",
  "entrance", "fade", "finances", "help", "huddles", "job", "listing", "listings", "maintenance", "nav", "orb", "overview", "passport", "plc", "portfolio",
  "property", "search", "settings", "spine", "steve", "terms", "termsqs", "tools",
  /* On Only me on live that day. */
  "app", "fixit", "lead", "leads", "warmnav",
];

async function liveLook(): Promise<string[]> {
  try {
    const r = await fetch(`${lookSource()}/api/new-look/levels`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const j = (await r.json()) as { ok?: boolean; everyone?: unknown; preview?: unknown };
    /* Everyone's, and the ones still on Only me on live (James, 18 Nov 2026:
       "leads and the lead pages are all off"): the demo is the system as he
       sees it, newest look on every screen that has one. */
    if (r.ok && j.ok && Array.isArray(j.everyone) && j.everyone.length) return [...j.everyone, ...(Array.isArray(j.preview) ? j.preview : LOOK_ON_18_NOV)].map(String);
  } catch {
    /* Live could not be asked: the list below stands until the next morning. */
  }
  return LOOK_ON_18_NOV;
}

export async function seedDemo(): Promise<{ users: number; homes: number; signIns: boolean }> {
  if (!demoMode() || !hasDb()) return { users: 0, homes: 0, signIns: false };
  const password = (process.env.DEMO_PASSWORD ?? "").trim();
  const world = demoWorld();
  const stamp = new Date().toISOString();
  const setup = { done: { password: stamp, rex: stamp, email: stamp, how: stamp, look: stamp }, emailSkipped: true, finishedAt: stamp, tour: "skipped", tourAt: stamp };

  for (const u of world.users) {
    const id = `demo-${u.id}`;
    await q(
      `INSERT INTO os_users (id, email, name, role, password_hash, rex_user_id, email_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash, rex_user_id = EXCLUDED.rex_user_id, locked_at = NULL`,
      [id, u.email, u.name, ROLE[u.role], password ? hashPassword(password) : "no-sign-in-until-DEMO_PASSWORD-is-set", u.id]
    );
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, 'os-setup', $2::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [id, JSON.stringify(setup)]
    );
    /* The dashboard's get-set checklist is for a new starter, not a demo. */
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [id, READY_PREF, JSON.stringify({ tourAt: stamp, dismissedAt: stamp })]
    );
    await connectDemoRex(id, u.email);
    /* Steve has already met them: no "what should I call you?" over the first screen. */
    await q(
      `INSERT INTO os_assistant_log (id, user_id, user_email, role, text, kind) VALUES ($1, $2, $3, 'assistant', 'Introduced at demo set-up.', 'onboarding-help')
       ON CONFLICT (id) DO NOTHING`,
      [`demo-met-${u.id}`, id, u.email]
    );
  }
  /* Real people's own sign-ins (DEMO_EXTRA_LOGINS on the demo service, set by
     James: "Name <email>, Name <email>"). Kept in a setting, not in this
     file, because the repository is public. Each sees the whole business,
     and stands in one invented agent's shoes for the screens that are about
     "my" diary and "my" homes, so nothing they open is empty. Same shared
     password. */
  const agents = world.users.filter((u) => u.role === "agent");
  const extras = (process.env.DEMO_EXTRA_LOGINS ?? "")
    .split(",")
    .map((x) => /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(x))
    .filter((m): m is RegExpExecArray => Boolean(m));
  for (const [n, m] of extras.entries()) {
    const email = m[2].toLowerCase();
    const as = agents[n % agents.length];
    const id = `demo-extra-${email.replace(/[^a-z0-9]+/g, "-")}`;
    await q(
      `INSERT INTO os_users (id, email, name, role, password_hash, rex_user_id, email_checked_at)
       VALUES ($1, $2, $3, 'owner', $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, rex_user_id = EXCLUDED.rex_user_id, locked_at = NULL`,
      [id, email, m[1] || email.split("@")[0], password ? hashPassword(password) : "no-sign-in-until-DEMO_PASSWORD-is-set", as.id]
    );
    for (const [key, value] of [["os-setup", setup], [READY_PREF, { tourAt: stamp, dismissedAt: stamp }]] as const) {
      await q(
        `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [id, key, JSON.stringify(value)]
      );
    }
    /* Their diary is the invented agent's: the OS finds a person's calendar by their REX address. */
    await connectDemoRex(id, as.email);
    await q(
      `INSERT INTO os_assistant_log (id, user_id, user_email, role, text, kind) VALUES ($1, $2, $3, 'assistant', 'Introduced at demo set-up.', 'onboarding-help')
       ON CONFLICT (id) DO NOTHING`,
      [`demo-met-${id}`, id, email]
    );
  }

  /* The managed-homes list (os_properties): the OS's own record of which
     homes are ours, which Compliance, Inspections and Portfolio all read. On
     live it came across from the old property-management system; here it is
     every let home in the invented world, the same homes REX's side shows. */
  type Row = Record<string, unknown>;
  const lets = world.rows.listings.filter((l) => l.system_listing_state === "leased");
  for (const l of lets) {
    const p = l.property as Row;
    const relns = ((l.related as Row).contact_reln_listing as Row[]) ?? [];
    const owner = relns.find((r) => (r.reln_type as Row).id === "owner")?.contact as Row | undefined;
    const tenants = relns.filter((r) => (r.reln_type as Row).id === "purchtenant").map((r) => String((r.contact as Row).name));
    const service = String((l.lettings_service_type as Row).text);
    const line = [p.adr_unit_number, `${p.adr_street_number} ${p.adr_street_name}`].filter(Boolean).join(", ");
    const hasGas = world.rows.compliance.some((c) => String(c.parent_object_id) === String(p.id) && c.type_id === "gas_safety");
    await q(
      `INSERT INTO os_properties (id, source, ref, address, name, locality, postcode, town, bedrooms, management, rex_property_id, match_how, active,
          landlord_name, landlord_email, landlord_phone, agent_name, tenant_names, service_level, service_basis, pm_managed, pm_status, pm_service, pm_read_at, no_gas)
       VALUES ($1, 'rex-pm', $2, $3, $4, $5, $6, $7, $8, 'Active letting agreement', $9, 'confident: exact', TRUE,
          $10, $11, $12, $13, $14, $15, 'Demo set-up', TRUE, 'occupied', $16, NOW(), $17)
       ON CONFLICT (id) DO UPDATE SET address = EXCLUDED.address, name = EXCLUDED.name, locality = EXCLUDED.locality, postcode = EXCLUDED.postcode,
          landlord_name = EXCLUDED.landlord_name, landlord_email = EXCLUDED.landlord_email, landlord_phone = EXCLUDED.landlord_phone, agent_name = EXCLUDED.agent_name,
          tenant_names = EXCLUDED.tenant_names, service_level = EXCLUDED.service_level, pm_service = EXCLUDED.pm_service, pm_read_at = NOW(), active = TRUE, pm_managed = TRUE`,
      [
        `pm-demo-${p.id}`, `PRP${String(p.id).slice(-5)}`, String(p.system_search_key), line, `${p.adr_suburb_or_town} ${p.adr_postcode}`, p.adr_postcode, p.adr_suburb_or_town,
        Number(l._beds ?? 2), String(p.id), owner?.name ?? null, owner?.email_address ?? null, owner?.phone_number ?? null, (l.listing_agent_1 as Row).name,
        tenants.join(", ") || null, service === "Let Only" ? "market_only" : service === "Rent Collect" ? "rent_collect" : "managed",
        service === "Let Only" ? "Tenant Find Service" : service === "Rent Collect" ? "Rent Collect Service" : "Experts Managed Service", !hasGas,
      ]
    );
  }
  /* The OS's own records, which no outside system holds: contractors, repair
     jobs at every stage, and market appraisals from booked to won. On homes
     and with people from the same invented world, dated from today. */
  const DAY = 86_400_000;
  const at = (days: number, hour = 10) => new Date(Date.parse(`${new Date(world.at + days * DAY).toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:30:00Z`)).toISOString();
  const CONTRACTORS = [
    ["Mercer Heating & Gas", "Gas & heating", "Dan Mercer"], ["Brightline Electrical", "Electrician", "Asha Brightline"], ["Aldgate Plumbing", "Plumber", "Owen Aldgate"],
    ["Fernley Property Care", "General maintenance", "Ruth Fernley"], ["Castle Rock Roofing", "Roofer", "Euan Castle"],
  ] as const;
  for (const [n, [name, trade, contact]] of CONTRACTORS.entries()) {
    await q(
      `INSERT INTO os_contractors (id, name, trade, contact, phone, email, active, created_by, public_liability_insurer, public_liability_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'Demo set-up', 'Sample Insurance Ltd', $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, trade = EXCLUDED.trade, contact = EXCLUDED.contact, active = TRUE, deleted_at = NULL`,
      [`demo-con-${n}`, name, trade, contact, `07700 9005${String(10 + n)}`, `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@sandbox.invalid`.replace("..", "."), at(200 + n * 30).slice(0, 10)]
    );
  }
  const JOBS: [string, string, string, string, "repair" | "planned", "emergency" | "urgent" | "routine", number, number][] = [
    /* title, description, category, status, kind, urgency, contractor, quote in pounds */
    ["Boiler losing pressure", "Tenant reports the boiler drops to zero every two days and needs topping up.", "Heating & boiler", "reported", "repair", "urgent", 0, 0],
    ["Leak under the kitchen sink", "Slow drip from the waste trap, cupboard base is damp.", "Plumbing", "approval", "repair", "urgent", 2, 185],
    ["Extractor fan not working", "Bathroom fan hums but does not turn.", "Electrical", "approved", "repair", "routine", 1, 95],
    ["Fence panel down", "One panel blown out on the left boundary after the wind.", "Garden & fences", "scheduled", "repair", "routine", 3, 140],
    ["Gas safety certificate due", "Annual gas safety check, certificate runs out next month.", "Gas", "scheduled", "planned", "routine", 0, 75],
    ["Front door lock sticking", "Key turns but the latch does not always catch.", "Locks & security", "done", "repair", "routine", 3, 85],
    ["Slipped roof tile", "One tile down above the back bedroom, no water in yet.", "Roof & gutters", "invoiced", "repair", "urgent", 4, 220],
    ["Washing machine not draining", "Landlord's machine, stops mid-cycle full of water.", "Appliance", "paid", "repair", "routine", 3, 110],
    ["Electrical report due", "Five-yearly electrical installation report.", "Electrical", "paid", "planned", "routine", 1, 180],
    ["No hot water", "No hot water since this morning, heating is fine.", "Heating & boiler", "reported", "repair", "emergency", 0, 0],
  ];
  const managed = lets.filter((l) => String((l.lettings_service_type as Row).text) === "Managed");
  for (const [n, [title, description, category, status, kind, urgency, con, quote]] of JOBS.entries()) {
    const l = managed[(n * 3) % managed.length];
    const p = l.property as Row;
    const relns = ((l.related as Row).contact_reln_listing as Row[]) ?? [];
    const owner = relns.find((r) => (r.reln_type as Row).id === "owner")?.contact as Row | undefined;
    const tenant = relns.find((r) => (r.reln_type as Row).id === "purchtenant")?.contact as Row | undefined;
    const stageNo = ["reported", "approval", "approved", "scheduled", "done", "invoiced", "paid"].indexOf(status);
    const reported = at(-(2 + stageNo * 3 + n), 9);
    const booked = stageNo >= 3;
    await q(
      `INSERT INTO os_works_orders (id, kind, status, property_id, property_name, locality, landlord, tenant, tenant_email, landlord_email, title, description, category, urgency,
          due_at, reported_by, reported_at, raised_by, contractor_id, contractor_name, scheduled_at, authority_pence, quote_pence, approved_by, approved_at,
          completed_at, completion_note, invoice_pence, invoice_ref, invoiced_at, paid_at, paid_how, property_lat, property_lng, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 25000, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $17, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        `demo-job-${n}`, kind, status, String(p.id), [p.adr_unit_number, `${p.adr_street_number} ${p.adr_street_name}`].filter(Boolean).join(", "), `${p.adr_suburb_or_town} ${p.adr_postcode}`,
        owner?.name ?? "", tenant?.name ?? "", tenant?.email_address ?? "", owner?.email_address ?? "", title, description, category, urgency,
        at(kind === "planned" ? 24 : urgency === "emergency" ? 1 : urgency === "urgent" ? 2 : 10), kind === "planned" ? "Compliance" : "Tenant", reported, (l.listing_agent_1 as Row).name,
        stageNo >= 1 ? `demo-con-${con}` : null, stageNo >= 1 ? CONTRACTORS[con][0] : "", booked ? at(stageNo >= 4 ? -2 - n : 2 + n, 13) : null,
        quote ? quote * 100 : null, stageNo >= 2 ? owner?.name ?? "Landlord" : "", stageNo >= 2 ? at(-(1 + stageNo), 11) : null,
        stageNo >= 4 ? at(-2 - n, 15) : null, stageNo >= 4 ? "Completed and tested. Tenant happy." : "",
        stageNo >= 5 ? quote * 100 : null, stageNo >= 5 ? `INV-${2040 + n}` : "", stageNo >= 5 ? at(-1 - n, 9) : null, stageNo >= 6 ? at(-1, 14) : null, stageNo >= 6 ? "Bank transfer" : "",
        Number(p.adr_latitude), Number(p.adr_longitude),
      ]
    );
  }
  const prospects = world.rows.contacts.filter((c) => c._kind === "landlord-lead");
  const MA: [string, number, number | null][] = [["booked", 1, null], ["booked", 3, null], ["pre_appraisal", 2, null], ["appraisal", 0, 1150], ["post_appraisal", -2, 1295], ["post_appraisal", -4, 995], ["takeon", -6, 1450], ["won", -9, 1250], ["won", -15, 1100], ["lost", -12, 1050]];
  const STREET = ["Linden Avenue", "Chapel Row", "Greyfriars Walk", "Bramble Close", "Station Approach", "Wellfield Road", "Abbey Mews", "Harcourt Street", "Calder Place", "Mossgiel Drive"];
  const TOWN: [string, string][] = [["Nottingham", "NG5 4TD"], ["Leicester", "LE2 6FB"], ["Edinburgh", "EH7 5QN"], ["Derby", "DE22 1GH"], ["Glasgow", "G12 8RJ"], ["Nottingham", "NG7 2LS"], ["Leicester", "LE3 9DW"], ["Edinburgh", "EH11 2PF"], ["Nottingham", "NG2 3AB"], ["Glasgow", "G41 3HT"]];
  for (const [n, [stage, days, valuation]] of MA.entries()) {
    const who = prospects[n % Math.max(1, prospects.length)];
    const [town, postcode] = TOWN[n];
    const scottish = /^(EH|G)\d/.test(postcode);
    const mine = agents.filter((a) => a.scotland === scottish);
    await q(
      `INSERT INTO os_market_appraisals (id, landlord, address, postcode, agent, appointment_at, stage, valuation, present_token, created_at, updated_at, service_level, fee_pct, setup_fee, valued_at, valued_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'managed', 12, 750, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        `demo-ma-${n}`, n === 8 ? "Raj Chauhan" : String(who?.name ?? "Landlord"), n === 8 ? "8 Recreation Terrace, Nottingham" : `${12 + n * 7} ${STREET[n]}, ${town}`, postcode,
        mine[n % mine.length].name, at(days, 11), stage, valuation, `demo-present-${n}`, at(Math.min(days, 0) - 5, 9), valuation ? at(Math.min(days, 0), 12) : null, valuation ? mine[n % mine.length].name : null,
      ]
    );
  }

  /* THE LOOK. Every look switch starts off on an empty database, which is the
     old look. The demo matches what the team sees on live: it asks the live
     system which screens are on for everyone (screen ids only, a public
     address: app/api/new-look/levels) and switches the same ones on here.
     Asked at every start and every morning, so it follows live by itself. If
     live cannot be reached, the list as it stood on 18 Nov 2026 is used. */
  const look = await liveLook();
  const lookAt = new Date().toISOString();
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ('new_look', $1::jsonb, NOW(), 'Demo set-up')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(Object.fromEntries(LOOK_SCREENS.filter((d) => look.includes(d.id)).map((d) => [d.id, { level: "everyone", by: "Demo set-up", at: lookAt }])))]
  );

  for (const a of AREA_DEFS) {
    await q(
      `INSERT INTO os_area_access (area, level, changed_by, changed_at) VALUES ($1, 'everyone', 'Demo set-up', NOW())
       ON CONFLICT (area) DO UPDATE SET level = 'everyone', changed_by = 'Demo set-up', changed_at = NOW()`,
      [a.id]
    );
  }
  return { users: world.users.length + extras.length, homes: lets.length, signIns: Boolean(password) };
}

/**
 * Back to this morning: the invented world rebuilt, and everything anybody
 * typed into the demo's own tables since cleared. Kept tables are the ones
 * set-up fills (users, their set-up, area access) and the bookkeeping the
 * server needs. DEMO_MODE only - this empties tables.
 */
export async function resetDemo(): Promise<{ cleared: number }> {
  if (!demoMode() || !hasDb()) return { cleared: 0 };
  const keep = new Set(["os_users", "os_user_prefs", "os_area_access", "os_switches", "os_sessions_revoked"]);
  const tables = await q<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'os\\_%'`);
  const clear = tables.map((t) => t.tablename).filter((t) => !keep.has(t) && /^[a-z0-9_]+$/.test(t));
  if (clear.length) await q(`TRUNCATE ${clear.map((t) => `"${t}"`).join(", ")}`);
  await q(`DELETE FROM os_user_prefs`);
  await q(`DELETE FROM os_switches`);
  resetDemoWorld();
  await seedDemo();
  return { cleared: clear.length };
}
