import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { recent } from "@/lib/audit";
import { hasDb, q } from "@/lib/db";
import { lettingsAgents } from "@/lib/rex-agents";

/**
 * The admin centre's data.
 *
 * Owner-only, and 404 rather than 403 for everyone else: a 403 confirms the
 * endpoint exists and that there is an admin area worth finding.
 *
 * The people list is the JOIN that makes this useful — REX's roster is the
 * real staff list, `os_users` is who has actually got in. Neither alone
 * answers "who hasn't set themselves up yet", which is the question James
 * asked for.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ error: "No database on this environment." }, { status: 503 });

  const accounts = await q<{
    id: string; email: string; name: string; role: string;
    photo: string | null; created_at: Date | string; last_seen_at: Date | string | null;
  }>(`select id, email, name, role, photo, created_at, last_seen_at from os_users order by email`);

  /* REX is the staff list; os_users is who has an account. Matched on email,
     lower-cased both sides — REX stores them with wild capitalisation
     ("Rhiannon.Dodge@", "Joe.Patten@TheLettingExperts.co.uk"). */
  let roster: Array<{ rexId: string; name: string; email: string }> = [];
  try {
    roster = (await lettingsAgents()).map((a) => ({ rexId: String(a.id), name: a.name, email: a.email }));
  } catch {
    /* REX being down must not blank the admin centre — the accounts half is
       still the more important half. */
  }

  const byEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a]));
  const people = roster.map((r) => {
    const acct = byEmail.get(r.email.toLowerCase());
    return {
      rexId: r.rexId,
      name: acct?.name || r.name || r.email.split("@")[0],
      email: r.email,
      userId: acct?.id ?? null,
      role: acct?.role ?? null,
      hasAccount: Boolean(acct),
      hasPhoto: Boolean(acct?.photo),
      createdAt: acct ? new Date(acct.created_at).toISOString() : null,
      lastSeenAt: acct?.last_seen_at ? new Date(acct.last_seen_at).toISOString() : null,
    };
  });

  // Anyone with an account but no REX row still belongs on the list.
  const inRoster = new Set(roster.map((r) => r.email.toLowerCase()));
  for (const a of accounts) {
    if (inRoster.has(a.email.toLowerCase())) continue;
    people.push({
      rexId: "", name: a.name || a.email.split("@")[0], email: a.email,
      userId: a.id, role: a.role, hasAccount: true, hasPhoto: Boolean(a.photo),
      createdAt: new Date(a.created_at).toISOString(),
      lastSeenAt: a.last_seen_at ? new Date(a.last_seen_at).toISOString() : null,
    });
  }

  const todos = await q<{ id: string; title: string; detail: string; area: string; state: string; created_at: Date | string }>(
    `select id, title, detail, area, state, created_at from os_todos order by
       case state when 'doing' then 0 when 'open' then 1 else 2 end, created_at desc`
  );

  return NextResponse.json({
    me: { id: owner.id, email: owner.email, name: owner.name },
    people: people.sort((a, b) => Number(b.hasAccount) - Number(a.hasAccount) || a.name.localeCompare(b.name)),
    summary: {
      staff: people.length,
      withAccounts: people.filter((p) => p.hasAccount).length,
      neverSignedIn: people.filter((p) => p.hasAccount && !p.lastSeenAt).length,
      noPhoto: people.filter((p) => p.hasAccount && !p.hasPhoto).length,
      notInvited: people.filter((p) => !p.hasAccount).length,
    },
    audit: await recent(60),
    todos: todos.map((t) => ({ ...t, createdAt: new Date(t.created_at).toISOString() })),
  });
}
