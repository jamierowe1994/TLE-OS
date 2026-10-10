import type { NextRequest } from "next/server";

/**
 * The visitor's address, as Railway's edge saw it.
 *
 * Every rate limit and audit line read the LEFTMOST X-Forwarded-For entry
 * until 10 Oct 2026 (Rig run 2, P-010) - the one the visitor writes
 * themselves, so a new made-up address per attempt walked straight past the
 * per-IP limit. Railway's edge sets X-Real-IP to the connecting address
 * (docs.railway.com, Public networking > Specs and limits). Failing that,
 * the RIGHTMOST forwarded entry is the one the last proxy added.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - 1] ?? "";
}
