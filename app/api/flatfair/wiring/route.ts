import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/admin";
import { diagnosticsBlocked } from "@/lib/diagnostics";
import { flatfairBase, flatfairConfigured, flatfairEnv, flatfairGet, listBranches } from "@/lib/flatfair";
import { syncState } from "@/lib/flatfair-sync";

/**
 * The Flatfair half of the wiring sheet (29 Sep 2026): read-only probes.
 * Which environment this service talks to comes first, because a demo token
 * reads perfectly well and still tells us nothing about TLE's real deposits.
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
  if (!flatfairConfigured()) {
    return NextResponse.json({ configured: false, note: "No FLATFAIR_API_TOKEN on this service yet." });
  }
  const env = flatfairEnv();
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];
  checks.push({
    key: "env",
    label: "Environment",
    ok: env === "live",
    detail:
      env === "live"
        ? `Live Flatfair (${flatfairBase()}).`
        : `${env === "demo" ? "Flatfair's demo" : "Flatfair's staging"} environment (${flatfairBase()}): good for building, but it holds test flatbonds, not TLE's. Nothing from here reaches the clean sweep.`,
  });
  const branches = await listBranches();
  checks.push({
    key: "branches",
    label: "Branches",
    ok: branches.ok,
    detail: branches.ok ? branches.rows.map((b) => `${b.name} (${b.id})`).join(", ") || "None" : branches.error ?? "No answer",
  });
  const list = await flatfairGet<{ count: number }>("/flatbond/?limit=1");
  checks.push({
    key: "flatbonds",
    label: "Flatbonds",
    ok: list.ok,
    detail: list.ok ? `${list.data?.count ?? 0} on this account` : list.error ?? "No answer",
  });
  const mine = await syncState();
  checks.push({
    key: "copy",
    label: "Our copy",
    ok: mine.flatbonds > 0,
    detail: mine.flatbonds
      ? `${mine.flatbonds} flatbonds and ${mine.docs} documents held, last read ${mine.lastFetched?.slice(0, 16).replace("T", " ")} UTC`
      : "Nothing copied yet - the sync has not run on this environment.",
  });
  checks.push({
    key: "webhook",
    label: "Webhook",
    ok: Boolean(process.env.FLATFAIR_WEBHOOK_SECRET),
    detail: process.env.FLATFAIR_WEBHOOK_SECRET
      ? "Ready at /api/flatfair/webhook. Flatfair set it up on request."
      : "FLATFAIR_WEBHOOK_SECRET is not set, so the webhook refuses everything.",
  });
  return NextResponse.json({ configured: true, checks });
}
