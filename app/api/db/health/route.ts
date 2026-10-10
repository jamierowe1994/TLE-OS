import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/admin";
import { dbStatus } from "@/lib/db";
import { diagnosticsBlocked } from "@/lib/diagnostics";

/**
 * Is the OS's memory actually there?
 *
 * Reports on the connection, never the credentials — no connection string,
 * no host, no password, ever. Creating the schema is a side effect of asking:
 * the first call after a deploy is what brings the tables into being.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;
  /* Connections and their health are the wiring sheet's (Rig run 2, P-008):
     owners and developers, see:wiring. diagnosticsBlocked only switches
     diagnostics off on an environment; it never asked who was looking. */
  if (!(await requireCapability(req, "see:wiring"))) {
    return NextResponse.json({ ok: false, error: "This is the wiring sheet's." }, { status: 403 });
  }

  const status = await dbStatus();
  return NextResponse.json({
    ...status,
    // Sessions can't be signed without this, so it belongs in the same
    // glance as the database itself.
    authSecretSet: Boolean(process.env.AUTH_SECRET),
  });
}
