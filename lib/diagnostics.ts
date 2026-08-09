import "server-only";
import { NextResponse } from "next/server";

/**
 * A fail-closed guard for the diagnostic endpoints (the wiring checks and the
 * storage health probe).
 *
 * WHY THIS EXISTS. The whole OS sits behind OS_ACCESS_CODE in middleware —
 * but that gate deliberately stands open when the variable is unset, so local
 * dev works without ceremony. On 9 Aug 2026 that turned out to be true of the
 * DEPLOYED site too: the variable had never been set on Railway, so
 * tle-os-production.up.railway.app was answering to anyone, and these
 * endpoints were handing out the storage bucket name, the R2 account
 * hostname, object keys and live REX lead counts to the open internet.
 *
 * Missing configuration should fail SHUT, not open, for anything that
 * describes our internals. So: in production, no access code means these
 * endpoints serve nothing at all. Development is unaffected.
 */
export function diagnosticsBlocked(): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.OS_ACCESS_CODE) return null; // middleware is doing its job
  return NextResponse.json(
    {
      ok: false,
      error:
        "Diagnostics are disabled because OS_ACCESS_CODE is not set on this deployment — which means the site has no access gate at all. Set it in the Railway variables and redeploy.",
    },
    { status: 503 }
  );
}
