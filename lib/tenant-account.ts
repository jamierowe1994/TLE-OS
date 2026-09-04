import "server-only";
import { cookies } from "next/headers";
import { hasDb, q } from "@/lib/db";
import { TENANT_COOKIE, uid, verifyPortalToken } from "@/lib/auth";
import { normaliseEmail } from "@/lib/users";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { getMeta } from "@/lib/business/deal-store";
import { derivedStageFor } from "@/lib/business/deal-stage";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import { findPassportByEmail } from "@/lib/passport";

/**
 * The tenant's account: who they are, and which deals are theirs.
 *
 * ── Same shape as the landlord's, for the same reasons ────────────────────
 *
 * No password. A magic link to the email Propoly holds for them on a deal
 * signs them in, once, for a day; the cookie then lasts as long as the
 * landlord's does. The account row lives in os_portal_accounts with
 * kind = 'tenant', beside the landlords, because it is the same kind of
 * thing: a person outside the business with a file inside it.
 *
 * ── Propoly is the register ──────────────────────────────────────────────
 *
 * A tenant is somebody whose email is on a Propoly deal's tenant_details.
 * That is the only list we have of tenants with an email, and it is the
 * list Kirstie works from, so it is the one to trust. An email on no deal
 * gets the same on-screen answer and no email, as the landlord flow does.
 * Cancelled deals do not count: a tenant whose only deal fell through has
 * nothing to sign into.
 */

export interface TenantAccount {
  id: string;
  email: string;
  name: string;
  activatedAt: string | null;
}

export interface TenantMatch {
  email: string;
  name: string;
  deals: BusinessDeal[];
}

type Row = {
  id: string;
  email: string;
  name: string;
  activated_at: Date | string | null;
};

const shape = (r: Row): TenantAccount => ({
  id: r.id,
  email: r.email,
  name: r.name,
  activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
});

function dealsFor(email: string, all: BusinessDeal[]): BusinessDeal[] {
  return all.filter(
    (d) => d.statusKey !== "cancelled" && d.app.tenants.some((t) => t.email && normaliseEmail(t.email) === email)
  );
}

export async function tenantByEmail(rawEmail: string): Promise<TenantMatch | null> {
  const email = normaliseEmail(rawEmail);
  if (!email.includes("@")) return null;
  const all = (await getAllPropolyDeals().catch(() => null)) ?? [];
  const deals = dealsFor(email, all);
  if (!deals.length) return null;
  const me = deals[0].app.tenants.find((t) => t.email && normaliseEmail(t.email) === email);
  return { email, name: me?.name || email, deals };
}

export async function upsertTenantAccount(m: TenantMatch): Promise<TenantAccount> {
  const rows = await q<Row>(
    `INSERT INTO os_portal_accounts (id, kind, email, name, rex_contact_id, profile)
     VALUES ($1, 'tenant', $2, $3, NULL, '{}'::jsonb)
     ON CONFLICT (email, kind) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, email, name, activated_at`,
    [uid(), m.email, m.name]
  );
  return shape(rows[0]);
}

export async function tenantAccountByEmail(rawEmail: string): Promise<TenantAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, activated_at FROM os_portal_accounts WHERE kind = 'tenant' AND email = $1`,
    [normaliseEmail(rawEmail)]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function tenantAccountById(id: string): Promise<TenantAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, activated_at FROM os_portal_accounts WHERE kind = 'tenant' AND id = $1`,
    [id]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function activateTenant(id: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_portal_accounts SET activated_at = NOW() WHERE kind = 'tenant' AND id = $1 AND activated_at IS NULL RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

/** The signed-in tenant for this request, or null. Server components and routes. */
export async function currentTenant(): Promise<TenantAccount | null> {
  const jar = await cookies();
  const id = verifyPortalToken(jar.get(TENANT_COOKIE)?.value, "tenant");
  if (!id) return null;
  return tenantAccountById(id);
}

/* ────────────────────────────── the view ───────────────────────────────── */

/** One stage as the tenant reads it. */
export interface TenantStage {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
}

export interface TenantDealView {
  id: string;
  property: string;
  locality: string;
  rentPcm: number | null;
  moveIn: string | null;
  stageKey: string;
  stages: TenantStage[];
  /** What is happening now, and what they can do about it, in their words. */
  now: string;
  next: string;
  agent: { name: string | null; email: string | null };
  otherTenants: string[];
  flatfair: boolean;
}

/* The eight stages in a tenant's words. Kirstie's labels are for Kirstie. */
const TENANT_WORDS: Record<string, { label: string; now: string; next: string }> = {
  deal_started: { label: "Offer accepted", now: "Your offer has been accepted and the paperwork is being set up.", next: "We will ask you for a holding fee to take the property off the market." },
  holding_fee: { label: "Holding fee", now: "We are collecting the holding fee.", next: "Once it is in, your referencing starts." },
  referencing: { label: "Referencing", now: "Your references are being checked: employer, previous landlord and credit.", next: "Reply quickly to anything the referencing team asks for. It is the one thing that speeds this up." },
  plc: { label: "Compliance checks", now: "Your references are back. We are checking the property's certificates and the landlord's documents.", next: "Nothing for you here. This is on us and the landlord." },
  deposit: { label: "Deposit", now: "The compliance checks have passed. Your deposit or deposit alternative is being arranged.", next: "You will hear from us, or from Flatfair if you chose the deposit alternative." },
  tenancy_agreement: { label: "Tenancy agreement", now: "Your tenancy agreement is being drawn up and sent for signing.", next: "Read it carefully and sign when it arrives. Both you and the landlord sign before anything else happens." },
  rent_payment: { label: "First rent", now: "The agreement is signed. Your first month's rent and the standing order are being set up.", next: "Pay the first month when the request arrives, and set up the standing order for the rest." },
  move_day: { label: "Move-in day", now: "Everything is in place. It is move-in day, or nearly.", next: "Keys, inventory and check-in. Your agent will confirm the time." },
};

export async function tenantDealViews(account: TenantAccount): Promise<TenantDealView[]> {
  const all = (await getAllPropolyDeals().catch(() => null)) ?? [];
  const mine = dealsFor(account.email, all);
  const out: TenantDealView[] = [];
  for (const d of mine) {
    const meta = await getMeta(d.app.id).catch(() => null);
    const stageKey = await derivedStageFor(d, meta);
    const idx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
    const stages: TenantStage[] = PORTAL_STAGES.map((s, i) => ({
      key: s.key,
      label: TENANT_WORDS[s.key]?.label ?? s.label,
      state: i < idx ? "done" : i === idx ? "current" : "upcoming",
    }));
    const words = TENANT_WORDS[stageKey] ?? TENANT_WORDS.deal_started;
    out.push({
      id: d.app.id,
      property: d.app.propertyName,
      locality: d.app.locality,
      rentPcm: d.app.offer,
      moveIn: d.app.startDate,
      stageKey,
      stages,
      now: words.now,
      next: words.next,
      agent: { name: d.managerName, email: d.managerEmail },
      otherTenants: d.app.tenants.filter((t) => !(t.email && normaliseEmail(t.email) === account.email)).map((t) => t.name),
      flatfair: Boolean(d.app.propoly?.depositReplacement),
    });
  }
  /* Nearest move-in first. */
  out.sort((a, b) => (a.moveIn ?? "9999").localeCompare(b.moveIn ?? "9999"));
  return out;
}

/** Their passport, if one was ever minted for this email. */
export async function tenantPassportPath(email: string): Promise<string | null> {
  const p = await findPassportByEmail(email, null).catch(() => null);
  return p ? `/tenant/passport/${p.token}` : null;
}
