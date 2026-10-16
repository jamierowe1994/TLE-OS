import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { letPeople } from "@/lib/let-people";
import { applicantKey, setLead } from "@/lib/lead-tenant";
import { forgetApplications } from "@/lib/applications";
import { record } from "@/lib/audit";
import { hasDb } from "@/lib/db";

/**
 * POST { key } → make that applicant the let's lead tenant (Lianna, 16 Oct
 * 2026). Held in the OS (lib/lead-tenant) and laid over the application
 * wherever it is read; REX's application is not changed. Only for somebody
 * who may open the let, and only for a person actually on it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There's no database on this environment, so the change can't be kept." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const key = String(body.key ?? "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) {
    return NextResponse.json({ ok: false, error: "This let is only in Propoly, so its lead tenant is changed there." }, { status: 400 });
  }
  const got = await letPeople(id, actor);
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: got.status ?? 403 });
  const tenants = got.let.tenants;
  if (tenants.length < 2) return NextResponse.json({ ok: false, error: "There's only one tenant on this let." }, { status: 400 });
  const who = tenants.find((t) => applicantKey(t) === key);
  if (!who) return NextResponse.json({ ok: false, error: "That person isn't on this let any more. Reload the page." }, { status: 400 });

  await setLead(id, who, actor.name || actor.email);
  forgetApplications();
  await record({
    kind: "lead_tenant_changed",
    actorId: actor.id,
    actorEmail: actor.email,
    subjectId: id,
    subjectEmail: who.email ?? "",
    detail: `${who.name} made the lead tenant on ${got.let.property}`,
  });
  return NextResponse.json({ ok: true, lead: { name: who.name, key } });
}
