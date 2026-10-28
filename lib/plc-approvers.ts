import "server-only";
import { hasDb, q } from "@/lib/db";
import { DEFAULT_PLC_APPROVERS } from "@/lib/plc";

/**
 * Who may give a PLC pack its final approval.
 *
 * James, 30 Sep 2026: the first check is Josel's, then "it gets passed over
 * to either Kirstie or Michael for approval". That is a short list of named
 * people rather than a role, because a role grows: everybody given the
 * compliance role later would quietly become a final approver too.
 *
 * Held in os_settings under "plc_approvers" so it can change from Admin
 * without a deploy. Until somebody saves it, the default in lib/plc applies.
 * Emails, never names, because that is what the session proves.
 */

const KEY = "plc_approvers";

const clean = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))]
    : [];

export async function plcApprovers(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_PLC_APPROVERS;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = clean(rows[0]?.value?.emails);
    return saved.length ? saved : DEFAULT_PLC_APPROVERS;
  } catch {
    return DEFAULT_PLC_APPROVERS;
  }
}

export async function isPlcApprover(email: string | null | undefined): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && (await plcApprovers()).includes(e);
}

/**
 * Who the final approval is for, by first name, for the sentence that says
 * so: "Kirstie, Michael or Susan". It was written into the screen as
 * "Kirstie's or Michael's" and stayed that way after the list changed.
 */
export async function plcApproverNames(): Promise<string> {
  const emails = await plcApprovers();
  let named = new Map<string, string>();
  if (hasDb()) {
    const rows = await q<{ email: string; name: string | null }>(
      `SELECT lower(email) AS email, name FROM os_users WHERE lower(email) = ANY($1)`,
      [emails]
    ).catch(() => []);
    named = new Map(rows.map((r) => [r.email, (r.name ?? "").trim().split(/\s+/)[0]]));
  }
  const firsts = emails.map((e) => {
    const n = named.get(e) || e.split("@")[0].split(/[._-]/)[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  });
  return firsts.length > 1 ? `${firsts.slice(0, -1).join(", ")} or ${firsts[firsts.length - 1]}` : firsts[0] ?? "the approvers";
}

/** An empty list is refused: nobody could ever approve a pack again. */
export async function savePlcApprovers(emails: string[], by: string): Promise<string[]> {
  const list = clean(emails);
  if (!list.length) throw new Error("Keep at least one person who can give the final approval.");
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify({ emails: list }), by]
  );
  return list;
}

/**
 * Who "Send for Final Approval" emails (20 Oct 2026): Susan, found rather
 * than written in. She is the approver who runs the business, so she is the
 * person on the approvers list who holds an owner or super_admin role in
 * os_users (on 20 Oct: Susan alone - Kirstie is pretenancy, Michael
 * compliance), with the address she signs in with. Should the list ever hold
 * two such people, the one listed first wins. An approver list without her
 * answers null and the button says why. A locked-out account is never emailed.
 */
export type FinalApprover = { email: string; name: string; firstName: string };

export async function finalApprover(): Promise<FinalApprover | null> {
  if (!hasDb()) return null;
  const emails = await plcApprovers();
  const rows = await q<{ email: string; name: string | null; role: string }>(
    `SELECT lower(email) AS email, name, role FROM os_users
      WHERE role IN ('owner', 'super_admin') AND lower(email) = ANY($1) AND locked_at IS NULL`,
    [emails]
  ).catch(() => []);
  /* An owner first (28 Oct 2026): Kirstie became super_admin on 26 Oct and,
     listed first, took Susan's place here: her own check would have been sent to herself. */
  const rank = (x: { role: string }) => (x.role === "owner" ? 0 : 1);
  const r = rows.sort((a, b) => rank(a) - rank(b) || emails.indexOf(a.email) - emails.indexOf(b.email))[0];
  if (!r) return null;
  const name = (r.name ?? "").trim() || r.email.split("@")[0];
  const first = name.split(/\s+/)[0];
  return { email: r.email, name, firstName: first.charAt(0).toUpperCase() + first.slice(1) };
}
