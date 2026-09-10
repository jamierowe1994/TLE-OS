import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { agentBook } from "@/lib/agent-book";
import { lettingsAgents } from "@/lib/rex-agents";
import { findUserByEmail, findUserById } from "@/lib/users";
import { recent } from "@/lib/audit";
import { hasDb, q } from "@/lib/db";

/**
 * One person, everything we hold. Owner-only; 404 for everyone else.
 *
 * ── Why the parameter is `who` and not `rexId` (10 Sep 2026) ─────────────
 *
 * It used to be a REX id, and the file was built by finding that id in
 * `lettingsAgents()`. That silently excluded everybody who is not a REX
 * lettings agent - which is Susan, Francesca, Kirstie and Michael, four of
 * the people whose screens most need checking. There was no link to them on
 * the list and no URL that would have worked if there had been: the route
 * answered "No such person in REX."
 *
 * So `who` is EITHER a REX id or an OS account id, resolved in that order,
 * and each is filled in from the other where it can be:
 *
 *   a REX agent          → their book, plus their account if they have joined
 *   an OS account only   → their account, and `book: null` rather than zeros
 *
 * `book: null` is the important half. Nought listings and no REX record are
 * very different statements, and an owner would act on the first one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ who: string }> }) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { who } = await ctx.params;

  const agents = await lettingsAgents().catch(() => []);
  const agent = agents.find((a) => String(a.id) === who) ?? null;

  /* By account when it is not a REX id. Their REX row, if they have one, is
     then matched on email so an agent's file is identical either way in. */
  const account = agent ? await findUserByEmail(agent.email) : await findUserById(who);
  if (!agent && !account) return NextResponse.json({ error: "No such person." }, { status: 404 });

  const email = (agent?.email ?? account?.email ?? "").toLowerCase();
  const linked = agent ?? (email ? (agents.find((a) => a.email.toLowerCase() === email) ?? null) : null);
  const rexId = linked ? String(linked.id) : (account?.rexUserId ?? null);

  /* Only pull a book when there is a REX id to pull it by. */
  const book = rexId ? await agentBook(rexId) : null;

  const audit = (await recent(200)).filter((a) => a.actorEmail === email || a.subjectEmail === email);

  /* Last seen lives on the account, and the file is where "have they ever
     been in?" gets asked about one person. */
  let lastSeenAt: string | null = null;
  if (account && hasDb()) {
    const rows = await q<{ last_seen_at: Date | string | null }>(
      `SELECT last_seen_at FROM os_users WHERE id = $1`,
      [account.id]
    ).catch(() => []);
    lastSeenAt = rows[0]?.last_seen_at ? new Date(rows[0].last_seen_at as string).toISOString() : null;
  }

  return NextResponse.json({
    person: {
      /* Null, not "", when they are not in REX - the page says so in words
         rather than printing "REX ". */
      rexId,
      name: account?.name || linked?.name || email.split("@")[0],
      email,
      photo: account?.photo ?? linked?.photo ?? null,
      position: linked?.title || null,
      phone: linked?.phone ?? null,
      onRex: Boolean(linked),
    },
    account: account
      ? {
          id: account.id,
          role: account.role,
          hasPhoto: Boolean(account.photo),
          createdAt: account.createdAt,
          rexUserId: account.rexUserId,
          lastSeenAt,
        }
      : null,
    book,
    audit: audit.slice(0, 20),
  });
}
