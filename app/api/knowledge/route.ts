import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import {
  deleteKnowledge,
  KNOWLEDGE_SECTIONS,
  listKnowledge,
  upsertKnowledge,
} from "@/lib/business/knowledge-store";

/**
 * The knowledge hub's own door (item 22, 5 Sep 2026).
 *
 * The same store /api/business/knowledge writes, behind a different gate:
 * that route asks for see:business, which is Susan's money, and there was no
 * way to let Francesca, Michael or Kirstie write a guide without handing them
 * the GCI. edit:knowledge is that way.
 *
 *   GET    /api/knowledge          → { entries, sections, unanswered }
 *   POST   /api/knowledge          { id?, title, content, section?, guide? } → { entry }
 *   DELETE /api/knowledge?id=...   → { deleted }
 *
 * `unanswered` is the writing order: the questions agents asked Steve that
 * he passed on because nothing written covered them. Each one is a guide
 * somebody needed and could not find.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PASSED_ON = /passed (it |this |that )?(on )?to james|not covered|isn't covered|is not covered|nothing written/i;

interface LogLine extends Record<string, unknown> {
  id: string;
  user_email: string;
  thread: string;
  role: string;
  text: string;
  created_at: Date;
}

/** Questions Steve could not answer from what was written, newest first. */
async function unanswered(limit = 30): Promise<{ id: string; asked: string; by: string; at: string }[]> {
  if (!hasDb()) return [];
  const rows = await q<LogLine>(
    `SELECT id, user_email, thread, role, text, created_at
       FROM os_assistant_log
      WHERE kind = 'ask'
      ORDER BY created_at DESC LIMIT 400`
  ).catch(() => [] as LogLine[]);
  /* Oldest first within each thread, so a question is followed by its answer. */
  const byThread = new Map<string, LogLine[]>();
  for (const r of rows.slice().reverse()) {
    const list = byThread.get(r.thread) ?? [];
    list.push(r);
    byThread.set(r.thread, list);
  }
  const out: { id: string; asked: string; by: string; at: string }[] = [];
  for (const lines of byThread.values()) {
    for (let i = 0; i < lines.length - 1; i++) {
      const qn = lines[i];
      const an = lines[i + 1];
      if (qn.role === "agent" && an.role === "assistant" && PASSED_ON.test(an.text)) {
        out.push({ id: qn.id, asked: qn.text.slice(0, 300), by: qn.user_email, at: new Date(qn.created_at).toISOString() });
      }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ error: "Not yours to edit." }, { status: 403 });
  const [entries, asked] = await Promise.all([listKnowledge(), unanswered()]);
  return NextResponse.json({ ok: true, entries, sections: KNOWLEDGE_SECTIONS, unanswered: asked, stored: hasDb() });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ error: "Not yours to edit." }, { status: 403 });
  let body: { id?: string; title?: string; content?: string; section?: string; guide?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a title and some content." }, { status: 400 });
  }
  if (typeof body.title !== "string" || typeof body.content !== "string") {
    return NextResponse.json({ error: "Expected a title and some content." }, { status: 400 });
  }
  try {
    const entry = await upsertKnowledge({
      id: body.id ?? null,
      title: body.title,
      content: body.content,
      section: body.section ?? null,
      guide: Boolean(body.guide),
      updatedBy: me.name || me.email,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ error: "Not yours to edit." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: await deleteKnowledge(id) });
}
