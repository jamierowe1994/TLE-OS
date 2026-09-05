import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { payPropGet, type PayPropAccountId } from "@/lib/payprop";

/**
 * GET /api/payprop/probe?account=scotland&path=report/all-payments&from_date=...
 *
 * A read-only window onto one PayProp endpoint, for the wiring tab. It
 * exists so a question like "does PayProp expose incoming payments" is
 * answered by asking PayProp, with our own key, and reading what comes
 * back - rather than by remembering a demo. GET only, one page, the first
 * few rows with their field names, and nothing written anywhere.
 *
 * Only a path under report/ or export/ is allowed, because those are the
 * read families; anything else is refused before a request is built.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const account = (sp.get("account") === "uk" ? "uk" : "scotland") as PayPropAccountId;
  const path = (sp.get("path") ?? "").replace(/^\/+/, "");
  if (!/^(report|export)\/[a-z0-9/_-]+$/i.test(path)) {
    return NextResponse.json({ ok: false, error: "Only a report/ or export/ path." }, { status: 400 });
  }
  const params: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    if (k !== "account" && k !== "path" && /^[a-z_]+$/i.test(k)) params[k] = v;
  }
  if (!params.rows) params.rows = "5";

  const res = await payPropGet(account, path, params);
  const result = res.result as Record<string, unknown> | null;
  const rows = Array.isArray(result?.items) ? (result!.items as unknown[]) : Array.isArray(result) ? (result as unknown[]) : null;
  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    error: res.error ?? null,
    keys: result && !Array.isArray(result) ? Object.keys(result) : null,
    pagination: result?.pagination ?? null,
    rowCount: rows?.length ?? null,
    rowKeys: rows?.[0] && typeof rows[0] === "object" ? Object.keys(rows[0] as object) : null,
    sample: rows?.slice(0, 3) ?? (result ? JSON.stringify(result).slice(0, 1500) : null),
  });
}
