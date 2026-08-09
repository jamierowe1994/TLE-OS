import { NextResponse } from "next/server";
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

export async function GET() {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;

  const status = await dbStatus();
  return NextResponse.json({
    ...status,
    // Sessions can't be signed without this, so it belongs in the same
    // glance as the database itself.
    authSecretSet: Boolean(process.env.AUTH_SECRET),
  });
}
