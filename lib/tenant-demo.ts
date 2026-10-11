import "server-only";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { DEMO_STAGE_COOKIE, isStage, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * Which stage the sample tenant is at: a cookie, set by the harness on the
 * sample's pages (app/tenant/demo/stage) so James can walk Sophie from a
 * fresh passport to living in the home and see every page change. Nothing
 * outside /tenant/demo reads it.
 *
 * ── Inside the launch tour (11 Oct 2026) ─────────────────────────────────
 * The tour (jamierowe1994/tle-os-demo) shows the sample on a phone, in an
 * iframe on its own site. A SameSite=Lax cookie is neither set nor sent in a
 * cross-site frame, so every tap reset Sophie to referencing. Framed, the
 * stage goes in a second cookie that is SameSite=None, Secure and
 * Partitioned (kept per top-level site, so the tour's stage never leaks into
 * anybody's own visit), and it is read first.
 */
const FRAMED_STAGE_COOKIE = `${DEMO_STAGE_COOKIE}-framed`;

export async function demoStage(override?: string | null): Promise<TenantStageKey> {
  /* ?stage= wins over the cookie, so a link can open the sample at one stage
     without moving the harness on for whoever else is looking. The process
     map links this way from every step that changes something for them. */
  if (isStage(override)) return override;
  const jar = await cookies();
  const framed = jar.get(FRAMED_STAGE_COOKIE)?.value;
  if (isStage(framed)) return framed;
  const c = jar.get(DEMO_STAGE_COOKIE)?.value;
  return isStage(c) ? c : "referencing";
}

/** Move the sample on: the framed cookie when the page is inside an iframe on https, else the usual one. */
export function setDemoStage(res: NextResponse, req: NextRequest, stage: TenantStageKey) {
  const framed = req.headers.get("sec-fetch-dest") === "iframe" && publicOrigin(req).startsWith("https:");
  if (framed) res.cookies.set(FRAMED_STAGE_COOKIE, stage, { path: "/tenant/demo", sameSite: "none", secure: true, partitioned: true, maxAge: 60 * 60 * 24 });
  else res.cookies.set(DEMO_STAGE_COOKIE, stage, { path: "/tenant/demo", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}
