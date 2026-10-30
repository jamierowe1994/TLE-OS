import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { letTenantEmails, letTenantFiles } from "@/lib/let-tenant-files";

/**
 * What the tenants on one let have sent in, for the agent's side of the file.
 *
 * A tenant uploading into the portal with nothing on the agent's screen would
 * be a feature that looks finished and quietly is not: the tenant would see
 * "sent", and nobody here would ever look at it. This is the other end.
 *
 * The id is the let's: a Propoly deal's (the pre-tenancy board) or an
 * application's (the let's Documents tab). Files are found by the tenants'
 * emails, not the deal stamped on them (lib/let-tenant-files, 30 Oct 2026).
 *
 * Staff only, and an agent only on their own lets. The tenant's own route
 * (/api/tenant/documents) is scoped to their account, so the two can never be
 * reached with the wrong kind of session.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const firstName = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const who = await letTenantEmails(id);
  if (actor.role === "agent" && who.agent && firstName(who.agent) !== firstName(actor.name)) {
    return NextResponse.json({ ok: false, error: `That let is ${who.agent.split(/\s+/)[0]}'s.` }, { status: 403 });
  }
  return NextResponse.json({ ok: true, documents: await letTenantFiles(id, who) }, { headers: { "cache-control": "private, no-store" } });
}
