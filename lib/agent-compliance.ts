import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import {
  expiryFor,
  REMIND_BANDS,
  stateOf,
  type ComplianceItem,
  type Requirement,
  type RequirementKind,
} from "@/lib/agent-compliance-types";

/**
 * The agent's own compliance (item 11).
 *
 * ── The frame, not the definition ─────────────────────────────────────────
 *
 * Michael has not yet said what "compliant" means for a partner agent, and
 * the OS must not decide it for him. So the LIST is data he edits, seeded
 * once with a starter set that is plainly labelled as such, and everything
 * else - what each agent holds, when it runs out, the reminders, his
 * overview - hangs off whatever the list says on the day.
 *
 * ── Two dates, two people ─────────────────────────────────────────────────
 *
 * done_at is the agent's word: "I have it, from this date". verified_at is
 * Michael's: "I have seen it". The profile shows the first; the overview
 * shows both; only the second reads as checked. A system where the agent's
 * own tick counts as compliance is not a compliance system.
 */

/* ─────────────────────────── the list ─────────────────────────── */

interface ReqRow extends Record<string, unknown> {
  id: string;
  title: string;
  what: string;
  kind: string;
  how_link: string;
  renews_months: number | null;
  required: boolean;
  active: boolean;
  position: number;
  updated_by: string;
}

const KINDS: RequirementKind[] = ["document", "training", "declaration", "check"];

const toReq = (r: ReqRow): Requirement => ({
  id: r.id,
  title: r.title,
  what: r.what,
  kind: KINDS.includes(r.kind as RequirementKind) ? (r.kind as RequirementKind) : "document",
  howLink: r.how_link,
  renewsMonths: r.renews_months,
  required: r.required,
  active: r.active,
  position: r.position,
  updatedBy: r.updated_by,
});

/**
 * The starter set. A best guess at what a self-employed lettings agent
 * under a network has to hold, written so Michael has something to edit
 * rather than a blank page. Every row says "starter" until he touches it.
 */
const STARTER: Omit<Requirement, "id" | "active" | "updatedBy">[] = [
  { title: "Photo ID seen", what: "Passport or driving licence, seen and recorded by TLE when you joined.", kind: "document", howLink: "", renewsMonths: null, required: true, position: 1 },
  { title: "Proof of address", what: "A bill or statement from the last three months.", kind: "document", howLink: "", renewsMonths: 12, required: true, position: 2 },
  { title: "Partner agreement signed", what: "Your signed agreement with The Lettings Experts.", kind: "document", howLink: "", renewsMonths: null, required: true, position: 3 },
  { title: "Right to Rent training", what: "Knowing what to check, and what a share code is, before any tenancy starts.", kind: "training", howLink: "", renewsMonths: 24, required: true, position: 4 },
  { title: "Anti-money laundering awareness", what: "What to look for and who to tell. Refreshed yearly.", kind: "training", howLink: "", renewsMonths: 12, required: true, position: 5 },
  { title: "Data protection awareness", what: "Handling applicant and landlord data properly. Refreshed yearly.", kind: "training", howLink: "", renewsMonths: 12, required: true, position: 6 },
  { title: "Self-employed status confirmed", what: "Your UTR or company number is on file with TLE.", kind: "declaration", howLink: "", renewsMonths: null, required: true, position: 7 },
  { title: "DBS check", what: "A basic disclosure, renewed every three years.", kind: "check", howLink: "https://www.gov.uk/request-copy-criminal-record", renewsMonths: 36, required: false, position: 8 },
];

async function seedIfEmpty(): Promise<void> {
  const n = await q<{ n: string }>(`SELECT COUNT(*)::text AS n FROM os_agent_requirements`);
  if (Number(n[0]?.n ?? 0) > 0) return;
  for (const s of STARTER) {
    await q(
      `INSERT INTO os_agent_requirements (id, title, what, kind, how_link, renews_months, required, position, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'starter') ON CONFLICT DO NOTHING`,
      [uid(), s.title, s.what, s.kind, s.howLink, s.renewsMonths, s.required, s.position]
    );
  }
}

export async function listRequirements(includeInactive = false): Promise<Requirement[]> {
  if (!hasDb()) return [];
  await seedIfEmpty();
  const rows = await q<ReqRow>(
    `SELECT id, title, what, kind, how_link, renews_months, required, active, position, updated_by
       FROM os_agent_requirements ${includeInactive ? "" : "WHERE active"} ORDER BY position, title`
  );
  return rows.map(toReq);
}

export async function saveRequirement(
  input: Partial<Requirement> & { title: string },
  by: string
): Promise<Requirement> {
  const id = input.id?.trim() || uid();
  const kind = KINDS.includes(input.kind as RequirementKind) ? (input.kind as RequirementKind) : "document";
  const months = input.renewsMonths == null || !Number.isFinite(Number(input.renewsMonths)) || Number(input.renewsMonths) <= 0
    ? null
    : Math.min(120, Math.round(Number(input.renewsMonths)));
  const rows = await q<ReqRow>(
    `INSERT INTO os_agent_requirements (id, title, what, kind, how_link, renews_months, required, active, position, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, what = EXCLUDED.what, kind = EXCLUDED.kind, how_link = EXCLUDED.how_link,
       renews_months = EXCLUDED.renews_months, required = EXCLUDED.required, active = EXCLUDED.active,
       position = EXCLUDED.position, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING id, title, what, kind, how_link, renews_months, required, active, position, updated_by`,
    [
      id,
      input.title.trim().slice(0, 120),
      (input.what ?? "").toString().slice(0, 600),
      kind,
      (input.howLink ?? "").toString().slice(0, 500),
      months,
      input.required ?? true,
      input.active ?? true,
      Number.isFinite(Number(input.position)) ? Number(input.position) : 99,
      by,
    ]
  );
  return toReq(rows[0]);
}

/** Retired, not deleted: what agents recorded against it stays readable. */
export async function retireRequirement(id: string, by: string): Promise<void> {
  await q(`UPDATE os_agent_requirements SET active = FALSE, updated_by = $2, updated_at = NOW() WHERE id = $1`, [id, by]);
}

/* ─────────────────────────── one agent ─────────────────────────── */

interface StatusRow extends Record<string, unknown> {
  user_id: string;
  requirement_id: string;
  done_at: Date | string | null;
  expires_at: Date | string | null;
  note: string;
  link: string;
  verified_by: string | null;
  verified_at: Date | string | null;
}

const ymd = (v: Date | string | null): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

function itemFor(r: Requirement, row: StatusRow | undefined, now: Date): ComplianceItem {
  const doneAt = ymd(row?.done_at ?? null);
  const expiresAt = ymd(row?.expires_at ?? null);
  const verifiedAt = row?.verified_at ? new Date(row.verified_at).toISOString() : null;
  const { state, daysLeft } = stateOf(r, row ? { doneAt, expiresAt, verifiedAt } : null, now);
  return {
    requirement: r,
    state,
    doneAt,
    expiresAt,
    daysLeft,
    note: row?.note ?? "",
    link: row?.link ?? "",
    verifiedBy: row?.verified_by ?? null,
    verifiedAt,
  };
}

export async function itemsFor(userId: string, now = new Date()): Promise<ComplianceItem[]> {
  if (!hasDb()) return [];
  const [reqs, rows] = await Promise.all([
    listRequirements(),
    q<StatusRow>(`SELECT * FROM os_agent_compliance WHERE user_id = $1`, [userId]),
  ]);
  const byReq = new Map(rows.map((r) => [r.requirement_id, r]));
  return reqs.map((r) => itemFor(r, byReq.get(r.id), now));
}

/** The agent's word: I have this, from this date. Clears any earlier check. */
export async function markDone(p: {
  userId: string;
  requirementId: string;
  doneAt: string;
  expiresAt?: string | null;
  note?: string;
  link?: string;
}): Promise<void> {
  const reqs = await listRequirements(true);
  const r = reqs.find((x) => x.id === p.requirementId);
  if (!r) throw new Error("That requirement is not on the list.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.doneAt)) throw new Error("Say when you got it, as a date.");
  const expires = p.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt) ? p.expiresAt : expiryFor(p.doneAt, r.renewsMonths);
  await q(
    `INSERT INTO os_agent_compliance (user_id, requirement_id, done_at, expires_at, note, link, verified_by, verified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NOW())
     ON CONFLICT (user_id, requirement_id) DO UPDATE SET
       done_at = EXCLUDED.done_at, expires_at = EXCLUDED.expires_at, note = EXCLUDED.note, link = EXCLUDED.link,
       verified_by = NULL, verified_at = NULL, updated_at = NOW()`,
    [p.userId, p.requirementId, p.doneAt, expires, (p.note ?? "").slice(0, 500), (p.link ?? "").slice(0, 500)]
  );
}

/** Michael's word: I have seen it. Or, with `seen` false, I have not. */
export async function verify(p: { userId: string; requirementId: string; by: string; seen: boolean }): Promise<void> {
  await q(
    `UPDATE os_agent_compliance
        SET verified_by = $3, verified_at = $4, updated_at = NOW()
      WHERE user_id = $1 AND requirement_id = $2`,
    [p.userId, p.requirementId, p.seen ? p.by : null, p.seen ? new Date() : null]
  );
}

/* ─────────────────────────── everyone ─────────────────────────── */

export interface AgentOverview {
  userId: string;
  name: string;
  email: string;
  role: string;
  items: ComplianceItem[];
  /** Required items not verified-and-in-date. */
  short: number;
}

export async function overview(now = new Date()): Promise<{ requirements: Requirement[]; agents: AgentOverview[] }> {
  if (!hasDb()) return { requirements: [], agents: [] };
  const [reqs, users, rows] = await Promise.all([
    listRequirements(),
    q<{ id: string; name: string; email: string; role: string }>(
      `SELECT id, name, email, role FROM os_users ORDER BY role = 'agent' DESC, name, email`
    ),
    q<StatusRow>(`SELECT * FROM os_agent_compliance`),
  ]);
  const byUser = new Map<string, Map<string, StatusRow>>();
  for (const r of rows) {
    const m = byUser.get(r.user_id) ?? new Map<string, StatusRow>();
    m.set(r.requirement_id, r);
    byUser.set(r.user_id, m);
  }
  const agents = users.map((u) => {
    const mine = byUser.get(u.id);
    const items = reqs.map((r) => itemFor(r, mine?.get(r.id), now));
    const short = items.filter((i) => i.requirement.required && i.state !== "verified").length;
    return { userId: u.id, name: u.name, email: u.email, role: u.role, items, short };
  });
  return { requirements: reqs, agents };
}

/* ─────────────────────────── reminders ─────────────────────────── */

export interface Reminder {
  userId: string;
  name: string;
  email: string;
  /** Required items missing or expired, and the ones inside a band. */
  lines: string[];
  bands: { requirementId: string; band: string; expiresAt: string | null }[];
}

/**
 * Who needs writing to today.
 *
 * Missing and expired: every run, but recorded under the band "missing" with
 * the expiry (or none), so the same gap is written about once, not daily.
 * Running out: once per 30/14/7 band per expiry date.
 */
export async function plannedReminders(now = new Date()): Promise<Reminder[]> {
  const { agents } = await overview(now);
  const sent = await q<{ user_id: string; requirement_id: string; band: string; expires_at: Date | string | null }>(
    `SELECT user_id, requirement_id, band, expires_at FROM os_agent_compliance_chases`
  ).catch(() => []);
  const seen = new Set(sent.map((s) => `${s.user_id}:${s.requirement_id}:${s.band}:${ymd(s.expires_at) ?? ""}`));
  const out: Reminder[] = [];
  for (const a of agents) {
    if (!a.email) continue;
    const lines: string[] = [];
    const bands: Reminder["bands"] = [];
    for (const i of a.items) {
      if (!i.requirement.required) continue;
      if (i.state === "missing" || i.state === "expired") {
        const band = i.state;
        const key = `${a.userId}:${i.requirement.id}:${band}:${i.expiresAt ?? ""}`;
        if (seen.has(key)) continue;
        lines.push(i.state === "missing" ? `${i.requirement.title} - not on file` : `${i.requirement.title} - expired ${i.expiresAt}`);
        bands.push({ requirementId: i.requirement.id, band, expiresAt: i.expiresAt });
      } else if (i.state === "due" && i.daysLeft != null) {
        const band = REMIND_BANDS.find((b) => i.daysLeft! <= b);
        if (!band) continue;
        const key = `${a.userId}:${i.requirement.id}:${band}:${i.expiresAt ?? ""}`;
        if (seen.has(key)) continue;
        lines.push(`${i.requirement.title} - runs out ${i.expiresAt} (${i.daysLeft} days)`);
        bands.push({ requirementId: i.requirement.id, band: String(band), expiresAt: i.expiresAt });
      }
    }
    if (lines.length) out.push({ userId: a.userId, name: a.name, email: a.email, lines, bands });
  }
  return out;
}

export async function recordReminded(r: Reminder): Promise<void> {
  for (const b of r.bands) {
    await q(
      `INSERT INTO os_agent_compliance_chases (user_id, requirement_id, band, expires_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [r.userId, b.requirementId, b.band, b.expiresAt ?? ""]
    );
  }
}
