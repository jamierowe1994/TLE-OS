import { NextRequest, NextResponse } from "next/server";
import {
  createApplication,
  getApplications,
  validateApplication,
  type NewApplication,
} from "@/lib/applications";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";

/**
 * GET  /api/applications?limit=100  → the live book from REX, newest first
 * POST /api/applications            → file a new one, status "received"
 *
 * The POST half is validated by US before REX is asked, because REX will
 * happily accept an application with no Right to Rent answer — it has nowhere
 * to put one. The check has to live here or it lives nowhere.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here.", applications: [] }, { status: 503 });
  }
  const limit = Math.min(300, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100);
  try {
    const applications = await getApplications(limit);
    return NextResponse.json({
      applications,
      pulledAt: new Date().toISOString(),
      writesLocked: rexWritesLocked(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, applications: [] }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: NewApplication & { askingRent?: number };
  try {
    body = (await req.json()) as NewApplication & { askingRent?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const errors = validateApplication(body, body.askingRent ?? null);
  if (errors.length) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  try {
    const result = await createApplication(body);
    return NextResponse.json({ ok: true, status: "received", result });
  } catch (e) {
    // RexWriteBlocked lands here carrying its own instructions for lifting it.
    return NextResponse.json(
      { error: (e as Error).message, writesLocked: rexWritesLocked("TenancyApplications", "create") },
      { status: 423 }
    );
  }
}
