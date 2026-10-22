import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { listTemplates } from "@/lib/message-templates";
import { AUTOMATION_STARTERS, SPECIAL_EMAILS } from "@/lib/automations/catalogue";
import { listAutomations, listRuns, saveAutomation } from "@/lib/automations/store";
import { caller } from "@/lib/automations/http";

/**
 * Settings > Automations (lib/automations, 22 Oct 2026).
 *
 * GET  → their automations and run log; an owner gets everybody's with ?all=1.
 *        Plus what the editor's pickers need and whether the switches are on.
 * POST → save one of theirs { id?, name, def, dailyCap, askedFor }. A new one
 *        is always saved OFF.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const everyone = who.owner && req.nextUrl.searchParams.get("all") === "1";
  try {
    const [automations, runs, templates, people, rooms, globalOn, customerOn] = await Promise.all([
      listAutomations({ userId: who.me.id, everyone }),
      listRuns({ userId: who.me.id, everyone, automationId: req.nextUrl.searchParams.get("automation"), limit: 80 }),
      listTemplates().catch(() => []),
      q<{ id: string; name: string }>(`SELECT id, name FROM os_users WHERE locked_at IS NULL ORDER BY name`).catch(() => []),
      q<{ name: string }>(
        `SELECT r.name FROM os_team_rooms r WHERE r.kind = 'general' OR EXISTS (SELECT 1 FROM os_team_members m WHERE m.room_id = r.id AND m.user_id = $1) ORDER BY r.name`,
        [who.me.id]
      ).catch(() => []),
      switchOn("agent_automations"),
      switchOn("customer_email"),
    ]);
    return NextResponse.json({
      me: { id: who.me.id, name: who.me.name, owner: who.owner },
      automations,
      runs,
      emails: [
        ...SPECIAL_EMAILS.map((e) => ({ id: e.id, name: e.name, group: "" })),
        ...AUTOMATION_STARTERS.map((s) => ({ id: s.id, name: s.name, group: "Written for automations", subject: s.subject, body: s.body })),
        ...templates.map((t) => ({ id: `msg:${t.id}`, name: t.name, group: "Message templates", subject: t.subject, body: t.body })),
      ],
      people,
      rooms: rooms.map((r) => r.name),
      switches: { automations: globalOn, customerEmail: customerOn },
    });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "Automations could not be read.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; def?: unknown; dailyCap?: number; askedFor?: string };
  try {
    const a = await saveAutomation({ id: b.id ?? null, userId: who.me.id, userName: who.me.name || who.me.email, name: b.name ?? "", def: b.def, dailyCap: b.dailyCap, askedFor: b.askedFor ?? null });
    return NextResponse.json({ ok: true, automation: a });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "It could not be saved.") }, { status: 400 });
  }
}
