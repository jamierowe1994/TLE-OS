import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";

/**
 * POST /api/tenant/passport/status { emails: string[] } -> { statuses: { [email]: Status } }
 *
 * Where each tenant's passport is, for a list of them at once (James, 8 Oct
 * 2026: the listing's Enquiries, "so we know which ones have gone out and
 * which ones haven't"). One read, never a send:
 *
 *   none     no passport, or one made but never emailed
 *   sent     emailed, nothing filled in yet
 *   started  they have begun filling it in
 *   done     finished
 *
 * The agent's own passports, as GET /api/tenant/passport/invite reads them.
 * The office (see:everything) also sees a tenant who finished another
 * agent's, so it never offers to send a second one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PassportStatus = { state: "none" | "sent" | "started" | "done"; invitedAt: string | null; submittedAt: string | null };

type Row = { email: string; agent_id: string | null; invited_at: Date | null; submitted_at: Date | null; started: boolean; created_at: Date };

const RANK = { none: 0, sent: 1, started: 2, done: 3 } as const;

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { emails?: unknown };
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))].slice(0, 500);
  if (!emails.length || !hasDb()) return NextResponse.json({ ok: true, statuses: {} });

  const everything = can(me.role, "see:everything");
  const rows = await q<Row>(
    `SELECT lower(email) AS email, agent_id, invited_at, submitted_at, created_at,
            (data->>'dob' <> '' OR data->>'applicantType' <> '' OR data->>'currentAddress' <> '' OR data->>'mobile' <> '') AS started
       FROM os_tenant_passports
      WHERE lower(email) = ANY($1::text[]) AND contact_id IS DISTINCT FROM 'demo'
        AND (agent_id = $2 OR ($3::boolean AND submitted_at IS NOT NULL))`,
    [emails, me.id, everything]
  ).catch(() => [] as Row[]);

  const statuses: Record<string, PassportStatus> = {};
  for (const r of rows) {
    const state: PassportStatus["state"] = r.submitted_at ? "done" : r.started ? "started" : r.invited_at ? "sent" : "none";
    const cur = statuses[r.email];
    if (!cur || RANK[state] > RANK[cur.state]) {
      statuses[r.email] = {
        state,
        invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : null,
        submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
      };
    }
  }
  return NextResponse.json({ ok: true, statuses });
}
