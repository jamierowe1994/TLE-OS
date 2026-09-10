import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { createTask, openTasksFor, setTaskDone, tasksForLead } from "@/lib/tasks";

/**
 * An agent's own tasks.
 *
 * GET  ?lead=<id>   the tasks on that lead
 * GET               everything still open for me
 * POST { title, detail?, dueAt?, leadId?, propertyId?, listingId?, kind? }
 * PATCH { id, done }
 *
 * A task belongs to the person signed in. Ticking somebody else's off is not
 * a feature, so PATCH is scoped to the owner in the UPDATE itself rather than
 * checked here and hoped for.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function me(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return id ? findUserById(id) : null;
}

export async function GET(req: NextRequest) {
  const user = await me(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const lead = (req.nextUrl.searchParams.get("lead") ?? "").trim();
  const tasks = lead ? await tasksForLead(lead) : await openTasksFor(user.id);
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(req: NextRequest) {
  const user = await me(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "A task needs a line of text." }, { status: 400 });

  const task = await createTask({
    userId: user.id,
    title,
    detail: String(b.detail ?? ""),
    dueAt: b.dueAt ? String(b.dueAt) : null,
    leadId: b.leadId ? String(b.leadId) : null,
    propertyId: b.propertyId ? String(b.propertyId) : null,
    listingId: b.listingId ? String(b.listingId) : null,
    kind: b.kind ? String(b.kind) : "general",
    createdBy: user.name || user.email,
  });
  if (!task) return NextResponse.json({ ok: false, error: "That did not save." }, { status: 500 });
  return NextResponse.json({ ok: true, task });
}

export async function PATCH(req: NextRequest) {
  const user = await me(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; done?: boolean };
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "Which task?" }, { status: 400 });
  const task = await setTaskDone(id, user.id, Boolean(b.done));
  if (!task) return NextResponse.json({ ok: false, error: "That task is not yours, or is gone." }, { status: 404 });
  return NextResponse.json({ ok: true, task });
}
