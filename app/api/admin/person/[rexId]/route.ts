import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { agentBook } from "@/lib/agent-book";
import { lettingsAgents } from "@/lib/rex-agents";
import { findUserByEmail } from "@/lib/users";
import { recent } from "@/lib/audit";

/** One person, everything we hold. Owner-only; 404 for everyone else. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ rexId: string }> }) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { rexId } = await ctx.params;

  const agent = (await lettingsAgents().catch(() => [])).find((a) => String(a.id) === rexId);
  if (!agent) return NextResponse.json({ error: "No such person in REX." }, { status: 404 });

  const account = await findUserByEmail(agent.email);
  const book = await agentBook(rexId);
  const audit = (await recent(200)).filter(
    (a) => a.actorEmail === agent.email.toLowerCase() || a.subjectEmail === agent.email.toLowerCase()
  );

  return NextResponse.json({
    person: {
      rexId,
      name: agent.name || agent.email.split("@")[0],
      email: agent.email,
      photo: agent.photo ?? null,
      position: agent.title || null,
      phone: agent.phone ?? null,
    },
    account: account
      ? {
          id: account.id,
          role: account.role,
          hasPhoto: Boolean(account.photo),
          createdAt: account.createdAt,
        }
      : null,
    book,
    audit: audit.slice(0, 20),
  });
}
