import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { createOrder, getOrder, listOrders, type WorksOrder } from "@/lib/works-orders";
import type { OsUser } from "@/lib/users";

/**
 * The maintenance rehearsal.
 *
 * James, 7 Sep 2026: "build this into a process for me in the admin section
 * so I can go through the flow and then be able to also send it via a URL to
 * somebody... We can book it as if we're a person, and then we should be
 * able to check both the landlord and the tenant areas to see what they would
 * see."
 *
 * ── What it actually is ───────────────────────────────────────────────────
 *
 * Not a mock. A rehearsal job is a real row in os_works_orders driven by the
 * real step model, the real move handler, the real contractor page and the
 * real email catalogue. Two things are different, and only two:
 *
 *   1. `rehearsal` is true on the row, so it is on no real list, in no
 *      figure, and no reminder or cron ever picks it up.
 *   2. Its emails are rendered in full and then KEPT rather than sent
 *      (lib/works-emails), so the landlord and tenant tabs show the real
 *      thing and no invented address is ever posted to.
 *
 * That is the whole point: a walkthrough that is a demonstration of the
 * product rather than a drawing of it. If the flow changes, this changes with
 * it, because it is the same code.
 *
 * ── The people ────────────────────────────────────────────────────────────
 *
 * Invented, and obviously so on the page. The addresses are on example.com,
 * which is reserved by the IETF for exactly this and can never belong to a
 * real person - so even if a send path were wired up by mistake tomorrow,
 * there is nobody at the other end.
 *
 * ── The link ──────────────────────────────────────────────────────────────
 *
 * A capability URL, the same shape as the onboarding preview: holding the
 * link is the permission, and the link reaches this and nothing else. It is
 * derived from AUTH_SECRET rather than stored, so it survives deploys and
 * stays the same string James pasted into a message last week.
 * MAINTENANCE_REHEARSAL_VERSION revokes it without signing the company out.
 */

const HOUSE = {
  propertyName: "18 Wellfield Terrace",
  locality: "Bishopston BS7 8HP",
  landlord: "Margaret Hollis",
  landlordEmail: "margaret.hollis@example.com",
  landlordMobile: "07700 900142",
  tenant: "Chris Bennett · 07700 900318",
  tenantEmail: "chris.bennett@example.com",
  access: "Tenant works from home Mondays and Fridays. Key safe by the bins, code on the file.",
  lat: 51.4795,
  lng: -2.5905,
};

/** The three things a walkthrough can report, so nobody starts on a blank form. */
export const REHEARSAL_FAULTS = [
  {
    id: "leak",
    title: "Water coming through the kitchen ceiling",
    category: "Plumbing",
    urgency: "emergency" as const,
    description: "Tenant rang: water coming through the kitchen ceiling, worse when the upstairs shower runs. They have turned the water off at the stopcock.",
  },
  {
    id: "boiler",
    title: "No hot water, boiler showing F22",
    category: "Heating & boiler",
    urgency: "urgent" as const,
    description: "No hot water since last night. The boiler display reads F22 and resetting it has not held.",
  },
  {
    id: "fan",
    title: "Bathroom extractor fan not running",
    category: "Electrical",
    urgency: "routine" as const,
    description: "The fan does not come on with the light. Some condensation on the window but no damp yet.",
  },
];

/** The trades book the rehearsal picks from. Never the real one. */
const TRADES = [
  { name: "Redland Plumbing & Heating", contact: "Dev Rawlings", trade: "Plumber", phone: "0117 496 0142", email: "jobs@redland-plumbing.example.com", address: "Gloucester Road, Bristol BS7 8AS", registration: "Gas Safe 512884", lat: 51.4832, lng: -2.5936, notes: "Two vans. Takes emergencies before 8am." },
  { name: "Aftonwell Heating", contact: "Priya Nandra", trade: "Gas Safe engineer", phone: "0117 496 0288", email: "office@aftonwell.example.com", address: "Filton Avenue, Bristol BS7 0AS", registration: "Gas Safe 604113", lat: 51.4931, lng: -2.5772, notes: "Boilers and gas safeties. Books a week out." },
  { name: "Sixpenny Electrical", contact: "Tom Gallagher", trade: "Electrician", phone: "0117 496 0377", email: "tom@sixpenny-electrical.example.com", address: "Church Road, Bristol BS5 9JJ", registration: "NICEIC 208877", lat: 51.4614, lng: -2.5541, notes: "EICRs and small works." },
  { name: "Kingsdown Property Care", contact: "Ellie Sharpe", trade: "Handyman", phone: "0117 496 0455", email: "hello@kingsdowncare.example.com", address: "Cotham Hill, Bristol BS6 6LF", registration: "", lat: 51.4671, lng: -2.6013, notes: "Odd jobs, fences, decorating." },
];

/* ── the link ───────────────────────────────────────────────────────────── */

function secret(): string {
  return process.env.AUTH_SECRET || "dev-only-secret-not-for-production";
}

export function rehearsalToken(): string {
  const version = process.env.MAINTENANCE_REHEARSAL_VERSION || "1";
  return createHmac("sha256", secret()).update(`maintenance-rehearsal:${version}`).digest("base64url").slice(0, 32);
}

export function rehearsalTokenValid(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(rehearsalToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── the walkthrough's own state ────────────────────────────────────────── */

export interface RehearsalEmail {
  id: string;
  role: "contractor" | "tenant" | "landlord" | "accounts";
  address: string;
  subject: string;
  html: string;
  at: string;
}

/**
 * The trades book, made on first use.
 *
 * Idempotent by name, so two people opening the link at once do not end up
 * with eight contractors. Placed by hand rather than geocoded: the demo has
 * to show distance working without spending a Google call on an invented
 * street.
 */
export async function ensureTrades(): Promise<void> {
  if (!hasDb()) return;
  for (const t of TRADES) {
    await q(
      `INSERT INTO os_contractors (id, name, contact, trade, phone, email, website, address, registration, notes, active, owner_id, created_by, lat, lng, rehearsal)
       SELECT $1, $2, $3, $4, $5, $6, '', $7, $8, $9, true, NULL, 'The rehearsal', $10, $11, true
        WHERE NOT EXISTS (SELECT 1 FROM os_contractors WHERE rehearsal AND name = $2)`,
      [randomBytes(12).toString("hex"), t.name, t.contact, t.trade, t.phone, t.email, t.address, t.registration, t.notes, t.lat, t.lng]
    ).catch(() => {});
  }
}

/** Every email the walkthrough has written, oldest first. */
export async function rehearsalEmails(orderId: string): Promise<RehearsalEmail[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; role: string; address: string; subject: string; html: string; created_at: Date }>(
    `SELECT id, role, address, subject, html, created_at FROM os_rehearsal_emails WHERE order_id = $1 ORDER BY created_at ASC`,
    [orderId]
  ).catch(() => []);
  return rows.map((r) => ({
    id: String(r.id), role: r.role as RehearsalEmail["role"], address: String(r.address ?? ""),
    subject: String(r.subject ?? ""), html: String(r.html ?? ""), at: new Date(r.created_at).toISOString(),
  }));
}

/** The walkthrough in progress, if there is one. Newest wins. */
export async function currentRehearsal(): Promise<WorksOrder | null> {
  const rows = await listOrders({ rehearsal: true, limit: 1 });
  return rows[0] ?? null;
}

export async function rehearsalById(id: string): Promise<NonNullable<Awaited<ReturnType<typeof getOrder>>> | null> {
  const found = await getOrder(id);
  /* The token reaches rehearsals and nothing else. A real job id typed into
     the same URL must not open somebody's actual repair. */
  if (!found || !found.order.rehearsal) return null;
  return found;
}

/** Start one. The fault is chosen; everything else is the invented house. */
export async function startRehearsal(faultId: string, by: string): Promise<WorksOrder> {
  await ensureTrades();
  const fault = REHEARSAL_FAULTS.find((f) => f.id === faultId) ?? REHEARSAL_FAULTS[0];
  return createOrder(
    {
      kind: "repair",
      propertyId: null,
      propertyName: HOUSE.propertyName,
      locality: HOUSE.locality,
      landlord: HOUSE.landlord,
      landlordEmail: HOUSE.landlordEmail,
      landlordMobile: HOUSE.landlordMobile,
      tenant: HOUSE.tenant,
      tenantEmail: HOUSE.tenantEmail,
      access: HOUSE.access,
      propertyLat: HOUSE.lat,
      propertyLng: HOUSE.lng,
      title: fault.title,
      description: fault.description,
      category: fault.category,
      urgency: fault.urgency,
      reportedBy: "Tenant",
      rehearsal: true,
    },
    by
  );
}

/** Clear a walkthrough away: the job, its timeline and its post. */
export async function endRehearsal(id: string): Promise<void> {
  if (!hasDb()) return;
  const found = await getOrder(id);
  if (!found || !found.order.rehearsal) return;
  await q(`DELETE FROM os_rehearsal_emails WHERE order_id = $1`, [id]).catch(() => {});
  await q(`DELETE FROM os_works_order_events WHERE order_id = $1`, [id]).catch(() => {});
  await q(`DELETE FROM os_works_orders WHERE id = $1 AND rehearsal`, [id]).catch(() => {});
}

/**
 * Who the walkthrough is being run by.
 *
 * A signed-in member of staff runs it as themselves, so they see their own
 * name in the emails they are showing somebody. On the shared link there is
 * nobody signed in, so the agent is invented too - and deliberately not a
 * real member of staff, because the recipient may forward what they see.
 */
export function rehearsalAgent(me: OsUser | null): OsUser {
  if (me) return me;
  return {
    id: "rehearsal-agent",
    name: "Robyn Ashworth",
    email: "robyn.ashworth@example.com",
    role: "agent",
    photo: null,
    createdAt: new Date().toISOString(),
    rexUserId: null,
  };
}

export const REHEARSAL_HOUSE = HOUSE;
