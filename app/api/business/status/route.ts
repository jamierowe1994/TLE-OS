import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getRexStatus } from "@/lib/business/rex-stats";
import { metaConfigPresence } from "@/lib/business/meta";
import { propolyConfigured } from "@/lib/business/propoly";
import { ghlConfigured } from "@/lib/business/ghl";

// Integration diagnostics for the admin panel: what REX actually answers
// (capability discovery), whether Meta is wired, and which env vars are
// present. SECURITY: only presence booleans / variable NAMES are returned —
// never a secret value.

// Env vars the deploy checklist cares about. Names only; values never leave
// the server.
const ENV_CHECKLIST = [
  "AUTH_SECRET",
  "ADMIN_EMAILS",
  "DATABASE_URL",
  "DATA_DIR",
  "REX_API_BASE",
  "REX_API_EMAIL",
  "REX_API_PASSWORD",
  "REX_ACCOUNT_ID",
  "META_SYSTEM_TOKEN",
  "META_APP_SECRET",
  "META_AD_ACCOUNT_LETTINGS",
  "META_PAGE_LETTINGS",
  "PROPOLY_API_KEY",
  "PROPOLY_AGENT_NAME",
  "GHL_API_TOKEN",
  "GHL_LOCATION_ID",
] as const;

// Propoly accepts either naming scheme (the Railway vars may predate the real
// header names) — report the canonical name present if either alias is set.
const ENV_ALIASES: Record<string, string[]> = {
  PROPOLY_API_KEY: ["PROPOLY_API_KEY", "PROPOLY_PASSWORD"],
  PROPOLY_AGENT_NAME: ["PROPOLY_AGENT_NAME", "PROPOLY_USERNAME"],
};

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json(
      { error: "This area is locked to the business owner." },
      { status: 403 }
    );
  }

  const rex = await getRexStatus();

  return NextResponse.json({
    rex,
    meta: { configured: metaConfigPresence() },
    propoly: { configured: propolyConfigured() },
    payprop: { status: "no-access-yet" },
    ghl: {
      status: ghlConfigured() ? "attempting-live" : "no-access-yet",
      configured: ghlConfigured(),
    },
    env: {
      present: ENV_CHECKLIST.filter((name) =>
        (ENV_ALIASES[name] ?? [name]).some((alias) => !!process.env[alias])
      ),
    },
  });
}
