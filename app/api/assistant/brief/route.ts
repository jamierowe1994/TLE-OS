import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { briefDue, makeBrief, type DiaryLine } from "@/lib/steve-brief";

/**
 * The morning brief (lib/steve-brief, 2 Oct 2026).
 *
 * GET  → { due } - whether today's has been given yet
 * POST → { text } - today's brief, written once and kept. `diary` is today's
 *        own appointments as their dashboard already holds them, rebuilt and
 *        capped here because it goes into a prompt. `again` writes a new one.
 *
 * The caller's own brief only: no id is taken.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function me(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return id ? findUserById(id) : null;
}

export async function GET(req: NextRequest) {
  const user = await me(req);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ due: await briefDue(user.id).catch(() => false) });
}

export async function POST(req: NextRequest) {
  const user = await me(req);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { diary?: unknown; again?: boolean };
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, n) : "");
  const diary: DiaryLine[] = Array.isArray(b.diary)
    ? b.diary.slice(0, 20).map((d) => {
        const x = (d ?? {}) as Record<string, unknown>;
        return {
          start: /^\d{2}:\d{2}$/.test(str(x.start, 5)) ? str(x.start, 5) : "",
          mins: typeof x.mins === "number" && Number.isFinite(x.mins) ? Math.max(0, Math.min(600, Math.round(x.mins))) : 30,
          kind: str(x.kind, 20),
          what: str(x.what, 120),
          where: str(x.where, 120),
          who: str(x.who, 80),
        };
      }).filter((d) => d.start && d.what)
    : [];
  const out = await makeBrief({ id: user.id, name: user.name ?? "", email: user.email }, diary, { force: b.again === true });
  return NextResponse.json(out);
}
